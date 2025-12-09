"""Builder for virtual column expressions using Pypika."""

from typing import Any, Dict, List, Optional, Set
import re
import logging

from pypika.terms import Term, Field, ValueWrapper
from pypika import Case
from pypika.functions import (
    Function, Abs, Coalesce, Concat, Upper, Lower, 
    Length, Substring, Cast
)

from backend.exceptions import QueryGenerationError
from backend.models.data_source import VirtualColumnDefinition

logger = logging.getLogger(__name__)


# Custom function classes for functions not directly available in Pypika
class Round(Function):
    """ROUND function for rounding numeric values."""
    def __init__(self, term, precision=None):
        super(Round, self).__init__('ROUND', term, precision) if precision is not None else super(Round, self).__init__('ROUND', term)


class SplitFunctionTerm(Term):
    """Custom term for SPLIT(value, delimiter, index) handling DB-specific syntax."""

    def __init__(self, value: Term, delimiter: Term, index: Term, db_type: str):
        super().__init__()
        self.value = value
        self.delimiter = delimiter
        self.index = index
        self.db_type = db_type

    def _normalized_db_type(self, explicit: Optional[str]) -> str:
        db_type = (explicit or self.db_type or 'clickhouse').lower()
        if db_type in {'csv', 'file', 'duckdb', 'kaggle'}:
            return 'duckdb'
        return db_type

    def get_sql(self, **kwargs) -> str:
        db_type = self._normalized_db_type(kwargs.get('db_type'))
        value_sql = self.value.get_sql(**kwargs)
        delimiter_sql = self.delimiter.get_sql(**kwargs)
        index_sql = self.index.get_sql(**kwargs)

        if db_type == 'clickhouse':
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
    - Functions: ROUND, ABS, COALESCE, CONCAT, UPPER, LOWER, SPLIT, etc.
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
        db_type: str = 'clickhouse'
    ):
        """
        Initialize the builder.
        
        Args:
            table_map: Dictionary mapping table names to Pypika Table objects
            default_table: Default Pypika Table object for unqualified column names
        """
        self.table_map = table_map
        self.default_table = default_table
        self.virtual_column_map: Dict[str, Term] = {}
        self._registered_names: Set[str] = set()
        self.db_type = self._normalize_db_type(db_type)
    
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
        
        logger.debug(f"Registering virtual column '{name}' with expression: {expression}")
        
        try:
            # Parse expression into Pypika Term
            pypika_term = self._parse_expression(expression)
            
            # Apply type cast if specified
            if output_type:
                pypika_term = Cast(pypika_term, output_type)
            
            # Store in map
            self.virtual_column_map[name] = pypika_term
            self._registered_names.add(name)
            
            logger.debug(f"Successfully registered virtual column '{name}'")
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
        column_refs = self._extract_column_references(expression)
        
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
        # This allows eval to work with our namespace mapping
        eval_expression = expression
        for col_ref in column_refs:
            if '.' in col_ref:
                safe_name = col_ref.replace('.', '__')
                eval_expression = eval_expression.replace(col_ref, safe_name)
        
        # Evaluate expression
        try:
            result = eval(eval_expression, {"__builtins__": {}}, namespace)
            
            if not isinstance(result, Term):
                # Wrap literals
                result = ValueWrapper(result)
            
            return result
            
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
        
        Args:
            expression: SQL expression
            
        Returns:
            List of column names (including qualified names)
        """
        # Pattern for identifiers: word or word.word
        # Matches: column_name, table.column_name
        pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\b'
        
        matches = re.findall(pattern, expression)
        
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
            'MIN', 'MAX', 'FLOOR', 'CEIL', 'SQRT', 'POW', 'MOD', 'SPLIT'
        }
        
        columns = []
        for match in matches:
            # Skip if it's a keyword or function
            if match.upper() not in sql_keywords and match.upper() not in function_names:
                if match not in columns:  # Avoid duplicates
                    columns.append(match)
        
        return columns
    
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
        })
        
        # Add Python operators (already work with Pypika Terms)
        # +, -, *, /, %, ==, !=, >, <, >=, <= are all overloaded in Pypika
        
        return namespace
    
    def _get_field_reference(self, field_name: str) -> Field:
        """
        Get Pypika Field reference for a column name.
        
        Supports qualified names: table.column
        
        IMPORTANT: Only treats as qualified (table.column) if the prefix is a known table name.
        Otherwise, the entire field_name (including dots) is treated as a column name.
        This allows columns like 'measurement.temp' to work correctly.
        
        Args:
            field_name: Column name, optionally qualified
            
        Returns:
            Pypika Field object
        """
        if '.' in field_name:
            # Check if this is actually a table-qualified reference
            table_name, column_name = field_name.split('.', 1)
            
            # Only split if the prefix is a known table name
            if table_name in self.table_map:
                # Qualified name: table.column
                logger.debug(f"Field '{field_name}' recognized as qualified: table '{table_name}', column '{column_name}'")
                table = self.table_map[table_name]
                return table[column_name]
            else:
                # Not a table prefix - treat entire name as column name
                # This handles columns like 'measurement.temp' where the dot is part of the column name
                logger.debug(f"Field '{field_name}' prefix '{table_name}' not a known table, treating as full column name")
                return self.default_table[field_name]
        else:
            # Unqualified name: column
            return self.default_table[field_name]
    
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
    def _normalize_db_type(db_type: Optional[str]) -> str:
        if not db_type:
            return 'clickhouse'
        normalized = db_type.lower()
        if normalized in {'csv', 'file', 'duckdb', 'kaggle'}:
            return 'duckdb'
        return normalized

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
