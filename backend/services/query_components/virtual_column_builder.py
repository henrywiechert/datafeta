# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Builder for virtual column expressions using Pypika."""

from typing import Any, Dict, List, Optional, Set, Tuple
import re
import logging

from pypika.terms import Term, Field, ValueWrapper
from pypika import Case
from pypika.functions import (
    Function, Abs, Coalesce, Concat, Upper, Lower, 
    Length, Substring, Cast
)

from backend.dialects import get_dialect, ClickHouseDialect
from backend.exceptions import QueryGenerationError
from backend.models.data_source import VirtualColumnDefinition

logger = logging.getLogger(__name__)


# DuckDB integer types narrower than BIGINT that can overflow during arithmetic.
# These are promoted to BIGINT when referenced in virtual column expressions so
# that intermediate arithmetic (e.g. uint16 * 20480) does not silently overflow.
_NARROW_INT_TYPES: frozenset = frozenset({
    'UINT8', 'UTINYINT',
    'UINT16', 'USMALLINT',
    'UINT32', 'UINTEGER',
    'INT8', 'TINYINT',
    'INT16', 'SMALLINT',
    'INT32', 'INTEGER', 'INT',
})

# Frontend virtual-column editor sends logical output-type hints rather than
# concrete SQL types.  In particular, DuckDB's bare NUMERIC cast can coerce the
# result into an unnecessary decimal type, so we avoid casting for the generic
# "numeric" hint and only apply casts for explicit SQL types.
_LOGICAL_OUTPUT_TYPES_NO_CAST: frozenset = frozenset({'numeric'})
_BUILTIN_SOURCE_FIELDS: frozenset = frozenset({'_source_database', '_source_table'})


# Custom function classes for functions not directly available in Pypika
class Round(Function):
    """ROUND function for rounding numeric values."""
    def __init__(self, term, precision=None):
        super(Round, self).__init__('ROUND', term, precision) if precision is not None else super(Round, self).__init__('ROUND', term)


class Floor(Function):
    """FLOOR function for rounding down to nearest integer."""
    def __init__(self, term):
        super(Floor, self).__init__('FLOOR', term)


class Ceil(Function):
    """CEIL function for rounding up to nearest integer."""
    def __init__(self, term):
        super(Ceil, self).__init__('CEIL', term)


class Int(Cast):
    """INT function for converting values to integers (uses BIGINT for large values)."""
    def __init__(self, term):
        # Use pypika's Cast class with BIGINT type
        super(Int, self).__init__(term, 'BIGINT')


class SplitFunctionTerm(Term):
    """Custom term for SPLIT(value, delimiter, index) handling DB-specific syntax."""

    def __init__(self, value: Term, delimiter: Term, index: Term, db_type: str):
        super().__init__()
        self.value = value
        self.delimiter = delimiter
        self.index = index
        self.db_type = db_type

    def get_sql(self, **kwargs) -> str:
        raw_db_type = (kwargs.get('db_type') or self.db_type or 'clickhouse').lower()
        use_clickhouse = isinstance(get_dialect(raw_db_type), ClickHouseDialect)
        value_sql = self.value.get_sql(**kwargs)
        delimiter_sql = self.delimiter.get_sql(**kwargs)
        index_sql = self.index.get_sql(**kwargs)

        if use_clickhouse:
            safe_value_sql = f"coalesce({value_sql}, '')"
            parts_sql = f"splitByString({delimiter_sql}, {safe_value_sql})"
            length_sql = f"toInt64(length({parts_sql}))"
            base_index_sql = (
                f"if(({index_sql}) > 0, ({index_sql}), {length_sql} + ({index_sql}) + 1)"
            )
            safe_length_sql = f"greatest({length_sql}, 1)"
            clamped_index_sql = f"greatest(1, least({base_index_sql}, {safe_length_sql}))"
            element_sql = f"arrayStringConcat(arraySlice({parts_sql}, {clamped_index_sql}, 1), '')"
            out_of_range_sql = f"(({base_index_sql}) < 1 OR ({base_index_sql}) > {length_sql} OR {length_sql} = 0)"
            sql = f"if({out_of_range_sql}, '', {element_sql})"
        else:
            # Default to split_part syntax (DuckDB/Postgres style)
            sql = f"split_part({value_sql}, {delimiter_sql}, {index_sql})"

        if getattr(self, 'alias', None):
            quote_char = kwargs.get('quote_char', '"')
            sql = f"{sql} {quote_char}{self.alias}{quote_char}"

        return sql


class VirtualColumnExpressionBuilder:
    """
    Converts virtual column string expressions to Pypika Terms.
    
    Supports:
    - Arithmetic: +, -, *, /, %
    - Comparison: ==, !=, >, <, >=, <=
    - Logical: AND, OR, NOT
    - Functions: ROUND, ABS, COALESCE, CONCAT, UPPER, LOWER, SPLIT, INT, etc.
    - Conditionals: CASE().when(condition, value).else_(default)
    - Qualified column names: table.column
    
    Security Features:
    - Validates against SQL injection (forbidden keywords)
    - Prevents references to other virtual columns
    - Uses restricted eval with safe namespace
    - Validates column names as identifiers
    """
    
    def __init__(
        self,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str = 'clickhouse',
        column_types: Optional[Dict[str, str]] = None,
        source_database: Optional[str] = None,
        source_table: Optional[str] = None,
    ):
        """
        Initialize the builder.
        
        Args:
            table_map: Dictionary mapping table names to Pypika Table objects
            default_table: Default Pypika Table object for unqualified column names
            db_type: Database type ('clickhouse', 'duckdb', etc.)
            column_types: Optional mapping of column name -> DB data type.  When
                provided for DuckDB sources, narrow integer columns (UINT16, INT32,
                etc.) are automatically promoted to BIGINT to prevent arithmetic
                overflow in virtual column expressions.
            source_database: Synthetic database name exposed via
                ``_source_database`` inside expressions.
            source_table: Synthetic table name exposed via ``_source_table``
                inside expressions.
        """
        self.table_map = table_map
        self.default_table = default_table
        self.virtual_column_map: Dict[str, Term] = {}
        self._registered_names: Set[str] = set()
        self._source_fields_map: Dict[str, List[str]] = {}  # Maps vc name -> source field names
        self.db_type = self._normalize_db_type(db_type)
        self.source_database = source_database or ''
        self.source_table = source_table or getattr(default_table, '_table_name', '')
        # Normalise to upper-case for reliable look-ups
        self.column_types: Dict[str, str] = {
            k: v.upper() for k, v in (column_types or {}).items()
        }
    
    def register_virtual_column(
        self, 
        virtual_column: VirtualColumnDefinition
    ) -> Term:
        """
        Parse and register a virtual column definition.
        
        Args:
            virtual_column: VirtualColumnDefinition to register
            
        Returns:
            Pypika Term representing the expression
            
        Raises:
            QueryGenerationError: If expression is invalid or contains references to other virtual columns
        """
        name = virtual_column.name
        expression = virtual_column.expression
        output_type = virtual_column.output_type
        
        # Check for duplicate names
        if name in self._registered_names:
            raise QueryGenerationError(f"Duplicate virtual column name: {name}")
        
        logger.info(f"Registering virtual column '{name}' with expression: '{expression}' (repr: {repr(expression)})")
        logger.debug(f"Registering virtual column '{name}' with expression: {expression}")
        
        try:
            # Extract source field names before parsing (for UNION queries to check availability)
            source_fields = self._extract_column_references(expression)
            
            # Parse expression into Pypika Term
            pypika_term = self._parse_expression(expression)
            
            # Apply type cast if specified
            resolved_output_type = self._resolve_output_type(output_type)
            if resolved_output_type:
                pypika_term = Cast(pypika_term, resolved_output_type)
            
            # Store in maps
            self.virtual_column_map[name] = pypika_term
            self._registered_names.add(name)
            self._source_fields_map[name] = source_fields
            
            logger.debug(f"Successfully registered virtual column '{name}' with source fields: {source_fields}")
            return pypika_term
            
        except Exception as e:
            logger.error(f"Failed to parse virtual column '{name}': {e}")
            raise QueryGenerationError(f"Invalid virtual column expression for '{name}': {e}")
    
    def get_virtual_column_term(self, name: str) -> Optional[Term]:
        """
        Retrieve a previously registered virtual column term.
        
        Args:
            name: Name of the virtual column
            
        Returns:
            Pypika Term if found, None otherwise
        """
        return self.virtual_column_map.get(name)
    
    def is_virtual_column(self, name: str) -> bool:
        """Check if a column name is a registered virtual column."""
        return name in self._registered_names
    
    def get_source_fields(self, name: str) -> List[str]:
        """
        Get the list of source field names that a virtual column depends on.
        
        This is used by UNION query builder to determine if a virtual column
        can be computed from the columns available in a specific table.
        
        Args:
            name: Name of the virtual column
            
        Returns:
            List of source field names, or empty list if not a virtual column
        """
        return self._source_fields_map.get(name, [])
    
    def _parse_expression(self, expression: str) -> Term:
        """
        Parse a SQL expression string into a Pypika Term.
        
        This uses a restricted eval() approach with a safe namespace.
        Supports both SQL-style CASE WHEN syntax and Pypika Python syntax.
        
        Args:
            expression: SQL expression string
            
        Returns:
            Pypika Term object
            
        Raises:
            ValueError: If expression is invalid
        """
        # Validate expression for security
        self._validate_expression_safety(expression)
        
        # Convert SQL CASE WHEN to Pypika syntax if present
        expression = self._convert_sql_case_to_pypika(expression)
        
        # Extract column references
        quoted_column_refs = self._extract_quoted_column_references(expression)
        column_refs = self._extract_column_references(expression)
        logger.debug(f"Extracted column references from '{expression}': {column_refs}")
        
        # Check for references to virtual columns (not allowed)
        virtual_refs = [col for col in column_refs if col in self._registered_names]
        if virtual_refs:
            raise ValueError(
                f"Virtual column expressions cannot reference other virtual columns. "
                f"Found references to: {', '.join(virtual_refs)}"
            )
        
        # Build safe namespace for eval
        namespace = self._build_safe_namespace(column_refs)
        
        # Replace qualified names (table.column) with safe identifiers (table__column)
        # This allows eval to work with our namespace mapping.
        #
        # Also replace quoted identifiers (e.g. "SA Avg nr nonGBR RRC conn UEs")
        # with temporary safe identifiers to support fields containing spaces.
        eval_expression = expression

        # Replace quoted identifiers first so the dot-replacement pass below
        # does not corrupt the content inside quotes (which would prevent the
        # quoted-literal match from succeeding).
        for index, (quoted_literal, column_name) in enumerate(quoted_column_refs):
            safe_name = f"_qcol_{index}"
            eval_expression = eval_expression.replace(quoted_literal, safe_name)
            if self._is_known_column_name(column_name):
                namespace[safe_name] = self._get_field_reference(column_name)
            else:
                namespace[safe_name] = ValueWrapper(column_name)

        for col_ref in column_refs:
            if '.' in col_ref:
                safe_name = col_ref.replace('.', '__')
                eval_expression = eval_expression.replace(col_ref, safe_name)
        
        logger.debug(f"Eval expression: '{eval_expression}', namespace keys: {list(namespace.keys())}")
        
        # Evaluate expression
        try:
            result = eval(eval_expression, {"__builtins__": {}}, namespace)
            
            if not isinstance(result, Term):
                # Wrap literals
                result = ValueWrapper(result)
            
            return result
            
        except TypeError as e:
            if "'Field' object is not callable" in str(e):
                raise ValueError(
                    f"Invalid expression syntax. It appears you're trying to call a column as a function. "
                    f"Expression: '{expression}'. If you meant to reference a column, remove the parentheses. "
                    f"If you meant to call a function, check that it's a supported function (ROUND, ABS, INT, MOD, etc.)"
                )
            raise ValueError(f"Failed to evaluate expression: {e}")
        except Exception as e:
            raise ValueError(f"Failed to evaluate expression: {e}")
    
    def _convert_sql_case_to_pypika(self, expression: str) -> str:
        """
        Convert SQL CASE WHEN syntax to Pypika Python syntax.
        
        Transforms:
            CASE WHEN x > 10 THEN 'High' WHEN x > 5 THEN 'Medium' ELSE 'Low' END
        To:
            CASE().when(x > 10, 'High').when(x > 5, 'Medium').else_('Low')
        
        Args:
            expression: Expression possibly containing SQL CASE syntax
            
        Returns:
            Expression with CASE converted to Pypika syntax
        """
        import re
        
        # Check if expression contains SQL CASE syntax
        if not re.search(r'\bCASE\s+WHEN\b', expression, re.IGNORECASE):
            return expression
        
        # Pattern to match CASE WHEN ... THEN ... ELSE ... END
        case_pattern = r'\bCASE\s+((?:WHEN\s+(.+?)\s+THEN\s+(.+?)\s*)+)(?:ELSE\s+(.+?)\s+)?END\b'
        
        def replace_case(match):
            when_clauses = match.group(1)
            else_clause = match.group(4) if match.group(4) else None
            
            # Extract all WHEN...THEN pairs
            when_pattern = r'WHEN\s+(.+?)\s+THEN\s+(.+?)(?=\s+(?:WHEN|ELSE|$))'
            when_matches = re.findall(when_pattern, when_clauses, re.IGNORECASE)
            
            # Build Pypika syntax
            pypika_expr = 'CASE()'
            for condition, value in when_matches:
                # Clean up condition and value
                condition = condition.strip()
                value = value.strip()
                
                # Convert SQL = to Python ==
                condition = re.sub(r'\b(\w+)\s*=\s*', r'\1 == ', condition)
                
                pypika_expr += f'.when({condition}, {value})'
            
            # Add ELSE clause if present
            if else_clause:
                else_clause = else_clause.strip()
                pypika_expr += f'.else_({else_clause})'
            
            return pypika_expr
        
        # Replace all CASE expressions
        converted = re.sub(case_pattern, replace_case, expression, flags=re.IGNORECASE | re.DOTALL)
        
        logger.debug(f"Converted SQL CASE syntax: '{expression}' -> '{converted}'")
        return converted
    
    def _validate_expression_safety(self, expression: str) -> None:
        """
        Validate that expression doesn't contain dangerous SQL.
        
        Args:
            expression: Expression to validate
            
        Raises:
            ValueError: If expression contains forbidden keywords
        """
        # Convert to uppercase for checking
        expr_upper = expression.upper()
        
        # Forbidden keywords (DDL/DML)
        forbidden_keywords = [
            'DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 
            'CREATE', 'ALTER', 'GRANT', 'REVOKE',
            'EXEC', 'EXECUTE', 'DECLARE', 'CURSOR',
            '--', '/*', '*/',  # SQL comments
            ';',  # Statement separator
        ]
        
        for keyword in forbidden_keywords:
            if keyword in expr_upper:
                raise ValueError(f"Forbidden keyword in expression: {keyword}")
        
        # Check for suspicious patterns
        if '__' in expression:  # Python special methods
            raise ValueError("Expression cannot contain '__'")
    
    def _extract_column_references(self, expression: str) -> List[str]:
        """
        Extract column names from expression.
        
        Supports:
        - Simple names: column_name
        - Qualified names: table.column_name
        - Multi-dot names: table.nested.column_name (for column names containing dots)
        
        Args:
            expression: SQL expression
            
        Returns:
            List of column names (including qualified/dotted names)
        """
        # Remove quoted identifiers before matching bare identifiers, so words inside
        # quoted column names (e.g. "Network Throughput") are not split into tokens.
        # Also remove single-quoted SQL string literals so values like 'High' or
        # database names inside CASE expressions are not misinterpreted as fields.
        expression_without_quoted = re.sub(
            r'"[^"\\]*(?:\\.[^"\\]*)*"|`[^`]+`|\'(?:\'\'|[^\'])*\'',
            ' ',
            expression,
        )

        # Pattern for identifiers: word or word.word.word... (any number of dot-separated parts)
        # Matches: column_name, table.column_name, table.nested.column_name
        pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\b'
        
        matches = re.findall(pattern, expression_without_quoted)
        
        # Filter out SQL keywords and function names
        sql_keywords = {
            'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT',
            'IS', 'NULL', 'TRUE', 'FALSE', 'IN', 'BETWEEN', 'LIKE',
            'ASC', 'DESC', 'AS', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'BY',
            'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL', 'ANY', 'SOME'
        }
        
        function_names = {
            'ROUND', 'ABS', 'COALESCE', 'CONCAT', 'UPPER', 'LOWER',
            'LENGTH', 'SUBSTRING', 'CAST', 'SUM', 'AVG', 'COUNT', 
            'MIN', 'MAX', 'FLOOR', 'CEIL', 'SQRT', 'POW', 'MOD', 'SPLIT', 'INT'
        }
        
        columns = []
        for match in matches:
            # Skip if it's a keyword or function
            if match.upper() not in sql_keywords and match.upper() not in function_names:
                if match not in columns:  # Avoid duplicates
                    columns.append(match)

        # Add quoted identifiers (double quotes / backticks) only when they refer
        # to columns — short tokens like "_" are SPLIT string literals.
        for _, column_name in self._extract_quoted_column_references(expression):
            if column_name not in columns and self._is_known_column_name(column_name):
                columns.append(column_name)
        
        return columns

    @staticmethod
    def _extract_quoted_column_references(expression: str) -> List[Tuple[str, str]]:
        """Extract quoted column identifiers.

        Supports both double-quoted and backtick-quoted identifiers:
        - "My Column"
        - `My Column`

        Returns a list of tuples in expression order:
        (original_quoted_literal, unquoted_column_name)
        """
        pattern = r'("([^"\\]*(?:\\.[^"\\]*)*)")|(`([^`]+)`)' 
        refs: List[Tuple[str, str]] = []
        for match in re.finditer(pattern, expression):
            quoted_literal = match.group(0)
            double_quoted_name = match.group(2)
            backtick_quoted_name = match.group(4)
            column_name = double_quoted_name if double_quoted_name is not None else backtick_quoted_name
            if column_name is not None:
                refs.append((quoted_literal, column_name))
        return refs

    def _is_known_column_name(self, name: str) -> bool:
        """Decide whether a double/backtick-quoted token is a column identifier.

        Quoted tokens are required for column names containing spaces or special
        characters. Short punctuation tokens (e.g. ``"_"``, ``":"``) are treated
        as string literals — commonly used as SPLIT delimiters in virtual columns.
        """
        if not name:
            return False

        if ' ' in name:
            return True

        if '.' in name:
            table_name, _ = name.split('.', 1)
            if table_name in self.table_map:
                return True

        if name in self.column_types:
            return True

        for col_name in self.column_types:
            if col_name.endswith(f'.{name}'):
                return True

        # Without schema metadata, treat only non-identifier tokens as literals.
        if not self.column_types:
            if len(name) == 1:
                return False
            if name in {'-', ':', '/', '|', '.', ',', ';'}:
                return False
            if re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', name):
                return False

        return False
    
    def _build_safe_namespace(self, column_refs: List[str]) -> Dict[str, Any]:
        """
        Build a safe namespace for eval() with column references and allowed functions.
        
        Args:
            column_refs: List of column names to include
            
        Returns:
            Dictionary mapping names to Pypika objects
        """
        namespace = {}
        
        # Add column references
        # For qualified names (table.column), use safe key (table__column)
        for col_ref in column_refs:
            safe_key = col_ref.replace('.', '__') if '.' in col_ref else col_ref
            namespace[safe_key] = self._get_field_reference(col_ref)
        
        # Add allowed functions
        namespace.update({
            'ROUND': Round,
            'FLOOR': Floor,
            'CEIL': Ceil,
            'ABS': Abs,
            'COALESCE': Coalesce,
            'CONCAT': Concat,
            'UPPER': Upper,
            'LOWER': Lower,
            'LENGTH': Length,
            'SUBSTRING': Substring,
            'CAST': Cast,
            'CASE': self._create_case_builder,
            'SPLIT': self._split_function,
            'INT': Int,
        })
        
        # Add Python operators (already work with Pypika Terms)
        # +, -, *, /, %, ==, !=, >, <, >=, <= are all overloaded in Pypika
        
        return namespace
    
    def _get_field_reference(self, field_name: str) -> Term:
        """
        Get Pypika term reference for a column name.
        
        Supports qualified names: table.column
        
        IMPORTANT: Only treats as qualified (table.column) if the prefix is a known table name
        AND it's NOT the default table. If the prefix matches the default table, we treat the
        entire field_name as a column name because:
        1. Columns in the default table don't need qualification
        2. The dot is likely part of the column name itself (e.g., 'table.column_name' as a column)
        
        Args:
            field_name: Column name, optionally qualified
            
        Returns:
            Pypika Term object
        """
        if field_name in _BUILTIN_SOURCE_FIELDS:
            if field_name == '_source_database':
                return ValueWrapper(self.source_database)
            return ValueWrapper(self.source_table)

        if '.' in field_name:
            # Check if this is actually a table-qualified reference
            table_name, column_name = field_name.split('.', 1)
            
            # Get the default table name for comparison
            default_table_name = getattr(self.default_table, '_table_name', None)
            is_multi_table = len(self.table_map) > 1
            
            # Split when prefix is a known table. In multi-table JOIN queries, always
            # treat table.column as qualified even for the primary/default table.
            # In single-table queries, a prefix matching the only table means the dot
            # is part of the literal column name (e.g. 'tableName.colName').
            if table_name in self.table_map and (is_multi_table or table_name != default_table_name):
                # Qualified name: table.column
                logger.debug(f"Field '{field_name}' recognized as qualified: table '{table_name}', column '{column_name}'")
                table = self.table_map[table_name]
                field_term = table[column_name]
                bare_name = column_name
            else:
                # Either not a table prefix, or prefix matches default table in single-table query
                # Treat entire name as column name (dot is part of column name)
                logger.debug(f"Field '{field_name}' treated as full column name (prefix '{table_name}' is default table or unknown)")
                field_term = self.default_table[field_name]
                bare_name = field_name
        else:
            # Unqualified name: column
            field_term = self.default_table[field_name]
            bare_name = field_name

        # For DuckDB, promote narrow integer columns to BIGINT to prevent arithmetic
        # overflow in virtual column expressions (e.g. UINT16 * 20480 overflows).
        if not isinstance(get_dialect(self.db_type), ClickHouseDialect) and self.column_types:
            col_type = self.column_types.get(bare_name) or self.column_types.get(field_name, '')
            if col_type in _NARROW_INT_TYPES:
                logger.debug(
                    f"Promoting column '{field_name}' from {col_type} to BIGINT "
                    f"for DuckDB virtual column arithmetic"
                )
                return Cast(field_term, 'BIGINT')

        return field_term
    
    @staticmethod
    def _create_case_builder():
        """
        Create a CASE builder for conditional expressions.
        
        Usage in expressions:
            CASE().when(condition, value).else_(default)
        
        Returns:
            Pypika Case object
        """
        return Case()

    @staticmethod
    def _resolve_output_type(output_type: Optional[str]) -> Optional[str]:
        """Normalize frontend logical output-type hints to SQL cast types.

        The frontend currently sends logical hints such as ``numeric``. These
        should not always translate to a literal SQL CAST target. For numeric
        expressions we preserve the engine's inferred type, which avoids
        DuckDB-specific coercion to DECIMAL/NUMERIC for integer arithmetic.

        Explicit SQL types such as DOUBLE, INTEGER, or VARCHAR are passed
        through unchanged.
        """
        if not output_type:
            return None

        normalized = output_type.strip()
        if normalized.lower() in _LOGICAL_OUTPUT_TYPES_NO_CAST:
            return None

        return normalized

    @staticmethod
    def _normalize_db_type(db_type: Optional[str]) -> str:
        # Return the dialect's canonical name so internal comparisons use the
        # dialect hierarchy instead of ad-hoc string sets.
        return get_dialect(db_type or 'clickhouse').name

    @staticmethod
    def _ensure_term(value: Any) -> Term:
        if isinstance(value, Term):
            return value
        return ValueWrapper(value)

    def _split_function(self, value: Any, delimiter: Any, index: Any) -> Term:
        """Build SPLIT(value, delimiter, index) term with DB-specific SQL."""
        value_term = self._ensure_term(value)
        delimiter_term = self._ensure_term(delimiter)
        index_term = self._ensure_term(index)
        return SplitFunctionTerm(value_term, delimiter_term, index_term, self.db_type)
