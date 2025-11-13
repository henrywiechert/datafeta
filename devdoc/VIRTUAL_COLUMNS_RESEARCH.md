# Virtual Columns Research - SQL-Level Calculations

## Executive Summary

This document explores implementing **virtual columns** (calculated/derived columns) at the SQL query level using **Pypika** as the translation mechanism. Virtual columns would allow users to create new columns from existing ones using mathematical operations, calculated entirely in the database rather than in the frontend.

**Key Benefits:**
- ✅ Performance: Database-native calculations (vectorized, optimized)
- ✅ Consistency: Same calculations work across ClickHouse and DuckDB
- ✅ Reusability: Virtual columns can be used as dimensions, measures, or in filters
- ✅ Type safety: Database handles type coercion and validation
- ✅ Existing infrastructure: Leverages current Pypika-based query builder

**Research Status:** 🔬 Research & Proposal Phase

---

## Table of Contents

1. [Background & Motivation](#background--motivation)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Proposed Architecture](#proposed-architecture)
4. [Implementation Proposals](#implementation-proposals)
5. [Use Cases & Examples](#use-cases--examples)
6. [Technical Challenges](#technical-challenges)
7. [Integration Points](#integration-points)
8. [Alternative Approaches](#alternative-approaches)
9. [Open Questions](#open-questions)

---

## Background & Motivation

### What Are Virtual Columns?

Virtual columns (also called calculated columns, derived columns, or computed columns) are columns that don't exist in the source data but are calculated from other columns using expressions.

**Examples:**
- `revenue = price * quantity`
- `profit_margin = (revenue - cost) / revenue * 100`
- `full_name = first_name || ' ' || last_name`
- `age_group = CASE WHEN age < 18 THEN 'Minor' ELSE 'Adult' END`

### Why SQL-Level vs Frontend?

| Aspect | SQL-Level | Frontend-Level |
|--------|-----------|----------------|
| **Performance** | ⚡ Database optimized, vectorized | 🐌 Row-by-row JS processing |
| **Data Volume** | ✅ Calculated before transfer | ❌ Transfer all raw data first |
| **Aggregation** | ✅ Can aggregate calculated values | ❌ Limited aggregation support |
| **Filtering** | ✅ Can filter on calculated columns | ⚠️ Filter before or after calc? |
| **Database Features** | ✅ Use native functions | ❌ Re-implement in JS |
| **Type Handling** | ✅ Database type system | ⚠️ Manual type conversion |

### Why Pypika?

We already use **Pypika** extensively for query generation:
- Column casting (`CastField`)
- Datetime extraction (`ExtractTerm`)
- Custom functions (`CustomFunction`)
- Aggregations, filters, joins, etc.

**Pypika's Expression Support:**
```python
from pypika import Field
from pypika.functions import Function

# Arithmetic
revenue = Field('price') * Field('quantity')

# Functions
profit = Function('ROUND', Field('revenue') - Field('cost'), 2)

# Conditional
adjusted = Field('value').case().when(Field('status') == 'active', Field('value') * 1.1).else_(Field('value'))
```

---

## Current Architecture Analysis

### Existing Query Building Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    QueryService.translate_to_sql             │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│  1. _build_table_context()                                   │
│     - Create Pypika Query and Table objects                  │
│     - Handle JOINs, UNIONs from VirtualTableDefinition       │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│  2. _build_select_clause() → SelectClauseBuilder             │
│     - Parse field references                                 │
│     - Apply column casts (CastField)                         │
│     - Apply datetime extraction (ExtractTerm)                │
│     - Apply aggregations                                     │
│     - Build SELECT fields list                               │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│  3. _build_filter_criteria() → FilterBuilder                 │
│     - Parse field references                                 │
│     - Apply column casts to filter fields                    │
│     - Build WHERE criteria                                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│  4. Apply GROUP BY, ORDER BY, LIMIT                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│  5. Generate SQL string from Pypika Query object             │
└─────────────────────────────────────────────────────────────┘
```

### Key Integration Points

#### 1. Field Reference Parsing (`_parse_field_reference`)
```python
def _parse_field_reference(
    self, 
    field_name: str, 
    table_map: Dict[str, Any], 
    default_table: Any
) -> Any:
    """
    Parse field references like:
    - "column_name" → table.column_name
    - "table_name.column_name" → specific_table.column_name
    """
```

**Opportunity:** This is where we could intercept virtual column definitions and return a Pypika expression instead of a simple field reference.

#### 2. Column Cast Application (`_apply_cast_if_configured`)
```python
def _apply_cast_if_configured(
    self,
    field_identifier: str,
    field_term: Any,
    column_casts: Optional[Dict[str, Dict[str, str]]]
) -> Any:
    """
    Wraps field in CastField if column_casts config exists.
    
    Example: column_casts = {'Revenue': {'cast_type': 'DOUBLE', 'replacement_pattern': ','}}
    Result: CAST(REPLACE(Revenue, ',', '') AS DOUBLE)
    """
```

**Observation:** We already have infrastructure for transforming field references into complex SQL expressions.

#### 3. Custom Pypika Terms
```python
# backend/services/query_components/terms.py

class CastField(Term):
    """Generates: CAST(REPLACE(field, pattern, '') AS type)"""
    
class ExtractTerm(Term):
    """Generates: EXTRACT(part FROM field)"""
    
class CustomFunction(Term):
    """Generates: FUNCTION_NAME(arg1, arg2, ...)"""
```

**Observation:** We have precedent for creating custom Pypika Term classes for complex SQL generation.

---

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend                                  │
│  - User defines virtual column: "profit = revenue - cost"    │
│  - Sends definition in ConnectionDetails or QueryDescription │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│                    Backend Models                            │
│  VirtualColumnDefinition:                                    │
│    - name: "profit"                                          │
│    - expression: {type: "subtract", left: "revenue", ...}    │
│    - output_type: "DOUBLE" (optional)                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│                Expression Parser/Builder                     │
│  - Parse expression tree                                     │
│  - Build Pypika Term from expression                         │
│  - Validate column references                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          v
┌─────────────────────────────────────────────────────────────┐
│                QueryService Integration                      │
│  - Recognize virtual column references                       │
│  - Substitute with Pypika expression                         │
│  - Use in SELECT, WHERE, GROUP BY, etc.                      │
└─────────────────────────────────────────────────────────────┘
```

### Data Models

#### Option A: Simple String Expressions (SQLAlchemy-like)
```python
class VirtualColumnDefinition(BaseModel):
    """Simple string-based SQL expression."""
    name: str  # e.g., "profit"
    expression: str  # e.g., "(revenue - cost)"
    output_type: Optional[str] = None  # e.g., "DOUBLE", "VARCHAR"
    description: Optional[str] = None

# Example usage:
virtual_columns = [
    VirtualColumnDefinition(
        name="profit",
        expression="(revenue - cost)",
        output_type="DOUBLE"
    ),
    VirtualColumnDefinition(
        name="profit_margin",
        expression="((revenue - cost) / revenue * 100)",
        output_type="DOUBLE"
    )
]
```

**Pros:**
- ✅ Simple to implement
- ✅ Maximum flexibility (any SQL expression)
- ✅ Users familiar with SQL can use directly

**Cons:**
- ❌ Security risk (SQL injection if not careful)
- ❌ No validation until query execution
- ❌ Database-specific syntax differences
- ❌ Harder to build UI for non-technical users

#### Option B: Structured Expression Tree (Safer)
```python
class ExpressionType(str, Enum):
    # Arithmetic
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    MODULO = "modulo"
    
    # Comparison
    EQUAL = "equal"
    NOT_EQUAL = "not_equal"
    GREATER = "greater"
    LESS = "less"
    GREATER_EQUAL = "greater_equal"
    LESS_EQUAL = "less_equal"
    
    # Logical
    AND = "and"
    OR = "or"
    NOT = "not"
    
    # Functions
    FUNCTION = "function"
    
    # Literals
    COLUMN = "column"
    LITERAL = "literal"
    
    # Conditional
    CASE_WHEN = "case_when"

class Expression(BaseModel):
    """Recursive expression tree."""
    type: ExpressionType
    
    # For binary operations
    left: Optional['Expression'] = None
    right: Optional['Expression'] = None
    
    # For unary operations
    operand: Optional['Expression'] = None
    
    # For literals and column references
    value: Optional[Any] = None
    
    # For functions
    function_name: Optional[str] = None
    arguments: Optional[List['Expression']] = None
    
    # For CASE WHEN
    conditions: Optional[List[Tuple['Expression', 'Expression']]] = None
    else_value: Optional['Expression'] = None

# Enable recursive type
Expression.update_forward_refs()

class VirtualColumnDefinition(BaseModel):
    """Type-safe virtual column with structured expression."""
    name: str
    expression: Expression
    output_type: Optional[str] = None
    description: Optional[str] = None

# Example usage:
profit_column = VirtualColumnDefinition(
    name="profit",
    expression=Expression(
        type=ExpressionType.SUBTRACT,
        left=Expression(type=ExpressionType.COLUMN, value="revenue"),
        right=Expression(type=ExpressionType.COLUMN, value="cost")
    ),
    output_type="DOUBLE"
)

profit_margin = VirtualColumnDefinition(
    name="profit_margin",
    expression=Expression(
        type=ExpressionType.MULTIPLY,
        left=Expression(
            type=ExpressionType.DIVIDE,
            left=Expression(
                type=ExpressionType.SUBTRACT,
                left=Expression(type=ExpressionType.COLUMN, value="revenue"),
                right=Expression(type=ExpressionType.COLUMN, value="cost")
            ),
            right=Expression(type=ExpressionType.COLUMN, value="revenue")
        ),
        right=Expression(type=ExpressionType.LITERAL, value=100)
    ),
    output_type="DOUBLE"
)
```

**Pros:**
- ✅ Type-safe and validated
- ✅ No SQL injection risk
- ✅ Can validate column references before execution
- ✅ Database-agnostic (Pypika handles translation)
- ✅ Easy to build UI/form builder for non-technical users
- ✅ Can generate user-friendly descriptions

**Cons:**
- ❌ More complex to implement
- ❌ Limited to supported operations
- ❌ Verbose JSON for complex expressions

#### Option C: Hybrid Approach
```python
class VirtualColumnDefinition(BaseModel):
    """Hybrid: Simple for basic cases, structured for complex."""
    name: str
    
    # Simple string expression (validated/sanitized)
    simple_expression: Optional[str] = None
    
    # Or structured expression tree
    structured_expression: Optional[Expression] = None
    
    output_type: Optional[str] = None
    description: Optional[str] = None
    
    @validator('structured_expression', 'simple_expression')
    def check_one_expression_type(cls, v, values):
        """Ensure exactly one expression type is provided."""
        if not v and not values.get('simple_expression') and not values.get('structured_expression'):
            raise ValueError('Either simple_expression or structured_expression must be provided')
        return v
```

**Pros:**
- ✅ Power users can use SQL directly
- ✅ UI can generate structured expressions
- ✅ Best of both worlds

**Cons:**
- ⚠️ Two code paths to maintain
- ⚠️ Still need SQL sanitization for simple expressions

---

## Implementation Proposals

### Proposal 1: Start Simple with String Expressions

**Phase 1: Minimal Viable Implementation**

1. **Data Model Addition** (`backend/models/data_source.py`)
```python
class VirtualColumnDefinition(BaseModel):
    """Simple string-based SQL expression for virtual columns."""
    name: str
    expression: str  # SQL expression, e.g., "(price * quantity)"
    output_type: Optional[str] = None  # e.g., "DOUBLE"
    description: Optional[str] = None

class ConnectionDetails(BaseModel):
    # ... existing fields ...
    
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None
```

2. **Query Model Addition** (`backend/models/query.py`)
```python
class QueryDescription(BaseModel):
    # ... existing fields ...
    
    # Virtual columns can be passed with query or loaded from connection
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None
```

3. **Expression Parser** (`backend/services/query_components/virtual_column_builder.py`)
```python
"""Builder for virtual column expressions."""

from typing import Any, Dict, Optional
from pypika.terms import Term, Field
from pypika import Query, Table

class VirtualColumnExpressionBuilder:
    """Converts virtual column definitions to Pypika Terms."""
    
    def __init__(self, table_map: Dict[str, Any], default_table: Any):
        self.table_map = table_map
        self.default_table = default_table
        self.virtual_column_map: Dict[str, Term] = {}
    
    def register_virtual_column(
        self, 
        name: str, 
        expression: str,
        output_type: Optional[str] = None
    ) -> Term:
        """
        Parse a virtual column expression and return a Pypika Term.
        
        Example:
            expression = "(revenue - cost)"
            Returns: (table.revenue - table.cost)
        """
        # Replace column names with table references
        pypika_expr = self._parse_expression(expression)
        
        # Apply type cast if specified
        if output_type:
            from pypika.functions import Cast
            pypika_expr = Cast(pypika_expr, output_type)
        
        # Store for later reference
        self.virtual_column_map[name] = pypika_expr
        
        return pypika_expr
    
    def _parse_expression(self, expression: str) -> Term:
        """
        Simple expression parser.
        
        WARNING: This is a simplified implementation for demonstration.
        Production code would need proper tokenization and parsing.
        """
        # This is a placeholder - actual implementation would be more robust
        # Could use pyparsing, or build a simple recursive descent parser
        
        # For now, we could use eval() with a restricted namespace
        # (NOT production-ready, just for prototype)
        import re
        
        # Find all column names (alphanumeric + underscore)
        column_pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b'
        columns = set(re.findall(column_pattern, expression))
        
        # Build namespace with Field references
        namespace = {}
        for col in columns:
            namespace[col] = self._get_field_reference(col)
        
        # Evaluate expression (UNSAFE - needs proper sanitization)
        try:
            result = eval(expression, {"__builtins__": {}}, namespace)
            return result
        except Exception as e:
            raise ValueError(f"Invalid expression: {expression}. Error: {e}")
    
    def _get_field_reference(self, field_name: str) -> Field:
        """Get table.field reference for a column name."""
        if '.' in field_name:
            table_name, col_name = field_name.split('.', 1)
            table = self.table_map.get(table_name, self.default_table)
            return table[col_name]
        else:
            return self.default_table[field_name]
    
    def get_virtual_column_term(self, name: str) -> Optional[Term]:
        """Retrieve a previously registered virtual column term."""
        return self.virtual_column_map.get(name)
```

4. **QueryService Integration** (`backend/services/query_service.py`)
```python
class QueryService:
    
    def translate_to_sql(
        self, 
        query_desc: QueryDescription, 
        table_name: str, 
        db_type: str = 'clickhouse',
        with_sampling: bool = False,
        with_optimization: bool = True,
        optimizer: Optional[Any] = None,
        connection_virtual_columns: Optional[List[VirtualColumnDefinition]] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Enhanced with virtual column support.
        """
        # Merge virtual columns from connection and query
        all_virtual_columns = self._merge_virtual_columns(
            connection_virtual_columns,
            query_desc.virtual_columns
        )
        
        # Build table context
        table_ctx = self._build_table_context(query_desc, db_type, table_name)
        
        # Initialize virtual column builder
        if all_virtual_columns:
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_ctx.table_map,
                default_table=table_ctx.default_table
            )
            
            # Register all virtual columns
            for vc in all_virtual_columns:
                vc_builder.register_virtual_column(
                    name=vc.name,
                    expression=vc.expression,
                    output_type=vc.output_type
                )
        else:
            vc_builder = None
        
        # Pass vc_builder to select builder, filter builder, etc.
        # ... rest of query building ...
    
    def _merge_virtual_columns(
        self,
        connection_vcs: Optional[List[VirtualColumnDefinition]],
        query_vcs: Optional[List[VirtualColumnDefinition]]
    ) -> List[VirtualColumnDefinition]:
        """Merge virtual columns, with query-level taking precedence."""
        result = {}
        
        if connection_vcs:
            for vc in connection_vcs:
                result[vc.name] = vc
        
        if query_vcs:
            for vc in query_vcs:
                result[vc.name] = vc  # Override
        
        return list(result.values())
```

5. **Field Reference Enhancement**
```python
def _parse_field_reference(
    self, 
    field_name: str, 
    table_map: Dict[str, Any], 
    default_table: Any,
    vc_builder: Optional[VirtualColumnExpressionBuilder] = None
) -> Any:
    """
    Enhanced to check for virtual columns first.
    """
    # Check if this is a virtual column
    if vc_builder:
        vc_term = vc_builder.get_virtual_column_term(field_name)
        if vc_term:
            return vc_term
    
    # Otherwise, normal field reference
    if '.' in field_name:
        table_name, column_name = field_name.split('.', 1)
        table = table_map.get(table_name)
        if table:
            return table[column_name]
        raise QueryGenerationError(f"Table '{table_name}' not found in query context")
    else:
        return default_table[field_name]
```

### Proposal 2: Structured Expression Tree (Safer, More Complex)

**Phase 1: Core Expression Types**

1. **Expression Models** (`backend/models/expression.py`)
```python
"""Expression models for virtual columns."""

from pydantic import BaseModel, validator
from typing import Optional, List, Any, Literal
from enum import Enum

class ExpressionType(str, Enum):
    # Arithmetic
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    
    # References
    COLUMN = "column"
    LITERAL = "literal"
    
    # Functions (expandable)
    FUNCTION = "function"

class Expression(BaseModel):
    """Recursive expression definition."""
    type: ExpressionType
    
    # Binary operations
    left: Optional['Expression'] = None
    right: Optional['Expression'] = None
    
    # Leaf nodes
    column_name: Optional[str] = None  # for COLUMN type
    literal_value: Optional[Any] = None  # for LITERAL type
    
    # Function calls
    function_name: Optional[str] = None  # for FUNCTION type
    function_args: Optional[List['Expression']] = None
    
    @validator('column_name')
    def validate_column_reference(cls, v, values):
        if values.get('type') == ExpressionType.COLUMN and not v:
            raise ValueError('column_name required for COLUMN type')
        return v
    
    @validator('literal_value')
    def validate_literal(cls, v, values):
        if values.get('type') == ExpressionType.LITERAL and v is None:
            raise ValueError('literal_value required for LITERAL type')
        return v

# Enable recursive reference
Expression.update_forward_refs()
```

2. **Expression to Pypika Converter** (`backend/services/query_components/expression_converter.py`)
```python
"""Convert Expression models to Pypika Terms."""

from typing import Any, Dict
from pypika.terms import Term, Field, ValueWrapper
from pypika.functions import Function as PypikaFunction
from backend.models.expression import Expression, ExpressionType

class ExpressionConverter:
    """Converts Expression trees to Pypika Terms."""
    
    def __init__(self, table_map: Dict[str, Any], default_table: Any):
        self.table_map = table_map
        self.default_table = default_table
    
    def convert(self, expr: Expression) -> Term:
        """Convert Expression to Pypika Term."""
        
        if expr.type == ExpressionType.COLUMN:
            return self._get_field(expr.column_name)
        
        elif expr.type == ExpressionType.LITERAL:
            return ValueWrapper(expr.literal_value)
        
        elif expr.type == ExpressionType.ADD:
            left = self.convert(expr.left)
            right = self.convert(expr.right)
            return left + right
        
        elif expr.type == ExpressionType.SUBTRACT:
            left = self.convert(expr.left)
            right = self.convert(expr.right)
            return left - right
        
        elif expr.type == ExpressionType.MULTIPLY:
            left = self.convert(expr.left)
            right = self.convert(expr.right)
            return left * right
        
        elif expr.type == ExpressionType.DIVIDE:
            left = self.convert(expr.left)
            right = self.convert(expr.right)
            return left / right
        
        elif expr.type == ExpressionType.FUNCTION:
            args = [self.convert(arg) for arg in expr.function_args]
            return PypikaFunction(expr.function_name, *args)
        
        else:
            raise ValueError(f"Unsupported expression type: {expr.type}")
    
    def _get_field(self, field_name: str) -> Field:
        """Get table.field reference."""
        if '.' in field_name:
            table_name, col_name = field_name.split('.', 1)
            table = self.table_map.get(table_name, self.default_table)
            return table[col_name]
        else:
            return self.default_table[field_name]
```

3. **Integration Similar to Proposal 1**

Virtual columns defined with structured expressions would be converted using `ExpressionConverter` instead of string parsing.

---

## Use Cases & Examples

### Use Case 1: Simple Calculated Metrics

**Business Need:** Calculate profit from revenue and cost columns.

**Virtual Column Definition:**
```json
{
  "name": "profit",
  "expression": "(revenue - cost)",
  "output_type": "DOUBLE",
  "description": "Net profit (revenue minus cost)"
}
```

**Usage in Query:**
```json
{
  "target_table": "sales",
  "dimensions": [
    {"field": "product", "flavour": "discrete"}
  ],
  "measures": [
    {"field": "profit", "aggregation": "sum", "alias": "total_profit"}
  ]
}
```

**Generated SQL:**
```sql
SELECT 
    "product",
    SUM((revenue - cost)) AS "total_profit"
FROM "sales"
GROUP BY "product"
```

### Use Case 2: Percentage Calculations

**Business Need:** Calculate profit margin percentage.

**Virtual Column Definition:**
```json
{
  "name": "profit_margin",
  "expression": "((revenue - cost) / revenue * 100)",
  "output_type": "DOUBLE",
  "description": "Profit margin as percentage"
}
```

**Usage:**
```json
{
  "measures": [
    {"field": "profit_margin", "aggregation": "avg", "alias": "avg_margin"}
  ]
}
```

**Generated SQL:**
```sql
SELECT 
    AVG(((revenue - cost) / revenue * 100)) AS "avg_margin"
FROM "sales"
```

### Use Case 3: String Concatenation

**Business Need:** Create full name from first and last name.

**Virtual Column Definition:**
```json
{
  "name": "full_name",
  "expression": "(first_name || ' ' || last_name)",
  "output_type": "VARCHAR",
  "description": "Full customer name"
}
```

### Use Case 4: Conditional Logic

**Business Need:** Categorize customers by order value.

**Virtual Column Definition:**
```json
{
  "name": "customer_segment",
  "expression": "CASE WHEN order_value >= 1000 THEN 'Premium' WHEN order_value >= 500 THEN 'Standard' ELSE 'Basic' END",
  "output_type": "VARCHAR"
}
```

### Use Case 5: Date Calculations

**Business Need:** Calculate days since last order.

**Virtual Column Definition:**
```json
{
  "name": "days_since_order",
  "expression": "(CURRENT_DATE - last_order_date)",
  "output_type": "INTEGER"
}
```

### Use Case 6: Complex Formula with Functions

**Business Need:** Calculate weighted average price.

**Virtual Column Definition:**
```json
{
  "name": "weighted_price",
  "expression": "ROUND(price * (1 - discount_pct / 100), 2)",
  "output_type": "DOUBLE"
}
```

---

## Technical Challenges

### Challenge 1: Security - SQL Injection

**Problem:** User-provided SQL expressions could contain malicious code.

**Solutions:**

1. **Option A: Whitelist Approach**
   - Only allow specific operations (add, subtract, multiply, divide)
   - Only allow specific functions (ROUND, ABS, COALESCE, etc.)
   - Structured expression trees (Proposal 2)

2. **Option B: Sanitization**
   - Parse and validate SQL before execution
   - Use SQL parser library (e.g., `sqlparse`)
   - Reject expressions with DDL/DML keywords

3. **Option C: Database-Level Protection**
   - Use read-only database connections
   - Run queries with minimal privileges
   - Already implemented: Pypika parameterization

**Recommendation:** Start with structured expressions (Proposal 2) for security, add string expressions later with strict validation.

### Challenge 2: Column Reference Validation

**Problem:** User references a column that doesn't exist.

**Solutions:**

1. **Pre-validation:**
   ```python
   def validate_virtual_column(
       self, 
       vc: VirtualColumnDefinition,
       available_columns: List[str]
   ):
       """Validate that all referenced columns exist."""
       referenced_cols = self._extract_column_names(vc.expression)
       invalid_cols = [c for c in referenced_cols if c not in available_columns]
       
       if invalid_cols:
           raise ValueError(f"Invalid columns in expression: {invalid_cols}")
   ```

2. **Lazy validation:**
   - Let database report error on execution
   - Catch and return friendly error message

**Recommendation:** Implement pre-validation in frontend when defining virtual column, lazy validation as fallback.

### Challenge 3: Circular Dependencies

**Problem:** Virtual column A references virtual column B which references A.

**Example:**
```python
vc1 = VirtualColumnDefinition(name="a", expression="(b + 1)")
vc2 = VirtualColumnDefinition(name="b", expression="(a - 1)")
```

**Solution:**

```python
def detect_circular_dependencies(
    virtual_columns: List[VirtualColumnDefinition]
) -> List[str]:
    """Detect circular dependencies in virtual column definitions."""
    
    graph = {}  # column_name -> set of dependencies
    
    for vc in virtual_columns:
        deps = extract_column_references(vc.expression)
        graph[vc.name] = deps
    
    # Topological sort to detect cycles
    visited = set()
    rec_stack = set()
    cycles = []
    
    def dfs(node):
        visited.add(node)
        rec_stack.add(node)
        
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in rec_stack:
                cycles.append(f"{node} -> {neighbor}")
                return True
        
        rec_stack.remove(node)
        return False
    
    for node in graph:
        if node not in visited:
            dfs(node)
    
    return cycles
```

### Challenge 4: Type Inference

**Problem:** What data type does a calculated column produce?

**Example:**
```python
# price (DOUBLE) * quantity (INTEGER) = ???
```

**Solutions:**

1. **Explicit types:** Require user to specify `output_type`
2. **Type inference:** Implement basic type rules
   ```python
   def infer_type(expr: Expression, column_types: Dict[str, str]) -> str:
       if expr.type == ExpressionType.ADD:
           left_type = infer_type(expr.left, column_types)
           right_type = infer_type(expr.right, column_types)
           return promote_type(left_type, right_type)
       # ... etc
   ```
3. **Database inference:** Let database determine type, query metadata

**Recommendation:** Start with explicit types, add inference later.

### Challenge 5: Database Compatibility

**Problem:** Different SQL dialects for same operation.

**Example:**
- PostgreSQL: `a || b` (string concat)
- MySQL: `CONCAT(a, b)`
- ClickHouse: `concat(a, b)`

**Solution:** Pypika already handles this! Different dialects are abstracted.

```python
from pypika.dialects import ClickHouseQuery, PostgreSQLQuery

# Pypika will render correctly for each dialect
query = Query.from_(table).select(
    Function('concat', table.first_name, table.last_name)
)
```

**Recommendation:** Use Pypika functions rather than raw SQL strings where possible.

---

## Integration Points

### 1. Connection Details (Persistent Virtual Columns)

Virtual columns defined at connection level are available for all queries on that data source.

**Where:** `backend/models/data_source.py`

```python
class ConnectionDetails(BaseModel):
    # ... existing fields ...
    
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None
```

**Storage:** Could be stored in:
- Frontend localStorage (current approach for connection settings)
- Backend database (if we add connection persistence later)
- Configuration files

### 2. Query Description (Query-Specific Virtual Columns)

Virtual columns defined per-query for ad-hoc calculations.

**Where:** `backend/models/query.py`

```python
class QueryDescription(BaseModel):
    # ... existing fields ...
    
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None
```

### 3. Column Metadata Endpoints

Virtual columns should appear alongside real columns in column lists.

**Enhancement to `/columns` endpoint:**
```python
@router.get("/columns", response_model=ColumnListResponse)
def list_columns(
    table: str,
    database: Optional[str] = None,
    include_virtual: bool = True,  # NEW parameter
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    # Get real columns from database
    columns = connector.list_columns(database, table)
    
    # Append virtual columns if requested
    if include_virtual and conn_details.virtual_columns:
        for vc in conn_details.virtual_columns:
            columns.append(Column(
                name=vc.name,
                type=vc.output_type or "UNKNOWN",
                is_virtual=True,  # NEW flag
                description=vc.description
            ))
    
    return ColumnListResponse(columns=columns)
```

### 4. Cardinality Service

Virtual columns need cardinality estimation for UI (discrete vs continuous detection).

**Enhancement:** `backend/services/cardinality_service.py`

```python
async def get_distinct_count(
    self,
    field: str,
    # ... other params ...
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None
):
    # Check if field is virtual
    if virtual_columns:
        vc = next((vc for vc in virtual_columns if vc.name == field), None)
        if vc:
            # Build query with virtual column in SELECT
            # ... use virtual column expression ...
    
    # ... rest of method ...
```

### 5. Frontend Field Builder

**Enhancement:** `frontend/src/components/Visualization/FieldBuilder/`

```typescript
interface VirtualColumnDefinition {
  name: string;
  expression: string | Expression;  // Union type for hybrid
  outputType?: string;
  description?: string;
}

// UI to create virtual columns
function VirtualColumnBuilder() {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  
  return (
    <div>
      <input 
        placeholder="Column name" 
        value={name} 
        onChange={e => setName(e.target.value)} 
      />
      <input 
        placeholder="Expression (e.g., price * quantity)" 
        value={expression} 
        onChange={e => setExpression(e.target.value)} 
      />
      <button onClick={() => saveVirtualColumn({name, expression})}>
        Add Virtual Column
      </button>
    </div>
  );
}
```

---

## Alternative Approaches

### Alternative 1: Frontend Calculation (DataFrame-like)

**Approach:** Calculate in frontend after data fetch, similar to Pandas.

```typescript
// After fetching data
const enrichedData = data.rows.map(row => ({
  ...row,
  profit: row.revenue - row.cost,
  profit_margin: ((row.revenue - row.cost) / row.revenue) * 100
}));
```

**Pros:**
- ✅ No backend changes
- ✅ Very flexible (any JS function)

**Cons:**
- ❌ Must fetch all raw data first (performance)
- ❌ Can't aggregate calculated columns efficiently
- ❌ Can't filter on calculated columns before fetch
- ❌ Calculations in multiple places (inconsistency)

**Verdict:** Only suitable for small datasets and simple visualizations.

### Alternative 2: Materialized Views

**Approach:** Create database views with calculated columns.

```sql
CREATE VIEW sales_with_profit AS
SELECT 
    *,
    (revenue - cost) AS profit,
    ((revenue - cost) / revenue * 100) AS profit_margin
FROM sales;
```

**Pros:**
- ✅ Database-native performance
- ✅ Can be indexed
- ✅ Reusable across applications

**Cons:**
- ❌ Requires database write permissions
- ❌ Not dynamic (can't change without DDL)
- ❌ Not suitable for CSV files
- ❌ User can't create ad-hoc calculations

**Verdict:** Good for production deployments with admin access, not suitable for self-service BI tool.

### Alternative 3: Preprocessing Pipeline (ETL)

**Approach:** Add calculated columns during data ingestion.

**Pros:**
- ✅ Best performance (pre-computed)
- ✅ Consistent calculations

**Cons:**
- ❌ Not dynamic
- ❌ Requires data pipeline setup
- ❌ Can't do ad-hoc analysis

**Verdict:** Complementary approach for production pipelines, doesn't replace need for dynamic calculations.

---

## Open Questions

### Q1: Should virtual columns be stored at connection or query level?

**Options:**
- A) Connection level only (persistent, reusable)
- B) Query level only (ad-hoc, temporary)
- C) Both (connection provides defaults, query can override/add)

**✅ DECISION:** **Query level** - Virtual columns will be part of the query description and saved with the visualization JSON (when saving feature is used).

### Q2: How complex should the expression language be?

**Spectrum:**
- Level 1: Basic arithmetic (`+`, `-`, `*`, `/`)
- Level 2: Add functions (`ROUND`, `ABS`, `CONCAT`)
- Level 3: Add conditionals (`CASE WHEN`)
- Level 4: Full SQL expressions

**✅ DECISION:** **Level 3** - Support basic arithmetic, functions, AND conditional expressions (CASE WHEN). Conditional logic is required.

### Q3: Should virtual columns be visible in column lists?

**Options:**
- A) Always include (flagged as virtual)
- B) Optional parameter (`include_virtual=true`)
- C) Separate endpoint (`/virtual-columns`)

**✅ DECISION:** **Option A** - Always include virtual columns in column lists, flagged with `is_virtual=true`.

### Q4: How to handle virtual columns in multi-table queries?

**Example:**
```python
# JOIN query with virtual column referencing joined table
virtual_columns = [
    VirtualColumnDefinition(
        name="customer_lifetime_value",
        expression="(orders.total_amount * customers.repeat_rate)"
    )
]
```

**✅ DECISION:** Support qualified column names (`table.column`) in expressions.

### Q5: Should we support virtual columns referencing other virtual columns?

**Example:**
```python
vc1 = VirtualColumnDefinition(name="profit", expression="(revenue - cost)")
vc2 = VirtualColumnDefinition(name="profit_margin", expression="(profit / revenue * 100)")
```

**Options:**
- A) No - keep simple, avoid dependencies
- B) Yes - more powerful, but need dependency resolution

**✅ DECISION:** **No** - Virtual columns cannot reference other virtual columns. Keep implementation simple and avoid dependency resolution complexity.

### Q6: How to handle errors in virtual column expressions?

**Scenarios:**
- Invalid syntax
- Division by zero
- NULL handling
- Type mismatch

**✅ DECISION:** All three approaches:
1. **Validation phase:** Catch syntax errors before execution
2. **Execution phase:** Let database handle runtime errors, catch and format nicely
3. **NULL handling:** Use `COALESCE` or document expected behavior

### Q7: UI/UX for defining virtual columns?

**Options:**
- A) Simple text input (for SQL-savvy users)
- B) Formula builder with autocomplete
- C) Visual expression builder (drag-and-drop)
- D) Mix of all three

**✅ DECISION:** **Option A** - Simple text input for SQL-savvy users. Start simple, can enhance later.

---

## Next Steps

### Immediate Research Tasks

1. ✅ **Document current architecture** (DONE - this document)
2. 🔄 **Prototype string expression parser**
   - Test with simple expressions
   - Evaluate security concerns
   - Test Pypika integration

3. 🔄 **Design data models**
   - Finalize `VirtualColumnDefinition` structure
   - Decide on simple vs structured expressions
   - Update Pydantic models

4. 🔄 **Security analysis**
   - SQL injection vectors
   - Expression sanitization strategies
   - Read-only enforcement

### Proposed Implementation Phases

#### Phase 1: MVP (Simple Arithmetic)
- ✅ String-based expressions
- ✅ Basic arithmetic operations (+, -, *, /)
- ✅ Connection-level virtual columns
- ✅ Integration in SELECT clause
- ✅ Basic validation
- 🎯 **Goal:** Proof of concept, validate approach

#### Phase 2: Enhanced Operations
- ✅ Query-level virtual columns
- ✅ Functions (ROUND, ABS, COALESCE)
- ✅ String operations (CONCAT, SUBSTRING)
- ✅ Integration in WHERE clause (filters)
- ✅ Better error handling
- 🎯 **Goal:** Production-ready basic features

#### Phase 3: Advanced Features
- ✅ Structured expression trees (optional)
- ✅ CASE WHEN conditionals
- ✅ Virtual column dependencies
- ✅ Type inference
- ✅ Formula builder UI
- 🎯 **Goal:** Power user features

#### Phase 4: Polish & Optimization
- ✅ Expression validation service
- ✅ Performance optimization
- ✅ Comprehensive error messages
- ✅ Documentation & examples
- 🎯 **Goal:** Production hardening

---

## Conclusion

**Virtual columns with SQL-level calculations via Pypika is a viable and powerful approach** that leverages our existing infrastructure. Key benefits include:

1. **Performance:** Database-native calculations
2. **Consistency:** Same calculation language across ClickHouse and DuckDB
3. **Integration:** Fits naturally into existing Pypika-based query builder
4. **Flexibility:** Users can define custom metrics without backend code changes

**✅ APPROVED APPROACH:**
- **Proposal 1** (simple string expressions) - SELECTED
- Query-level storage (saved with visualization JSON)
- Support Level 3 complexity: arithmetic, functions, AND conditional expressions (CASE WHEN)
- Always show virtual columns in column lists (flagged as `is_virtual=true`)
- Support qualified column names (`table.column`)
- No virtual-column-to-virtual-column references
- Comprehensive error handling (validation + execution + NULL handling)
- Simple text input UI

**Risks to mitigate:**
- SQL injection (use structured expressions or strict parsing)
- Complex error messages (provide helpful validation and error formatting)
- Performance impact (minimal - calculations happen in database)

**Next actions:**
1. Prototype simple expression parser
2. Test security implications
3. Create data model PR for feedback
4. Implement Phase 1 MVP

---

## Appendix: Pypika Expression Reference

### Arithmetic Operations
```python
from pypika import Field

# Addition
Field('price') + Field('tax')

# Subtraction
Field('revenue') - Field('cost')

# Multiplication
Field('price') * Field('quantity')

# Division
Field('total') / Field('count')

# Parentheses for order of operations
(Field('revenue') - Field('cost')) / Field('revenue')
```

### Functions
```python
from pypika.functions import (
    Round, Abs, Coalesce, Concat, Upper, Lower,
    Sum, Avg, Count, Min, Max
)

# Rounding
Round(Field('price'), 2)

# Absolute value
Abs(Field('difference'))

# NULL handling
Coalesce(Field('discount'), 0)

# String operations
Concat(Field('first_name'), ' ', Field('last_name'))
Upper(Field('status'))

# Aggregations (in SELECT with GROUP BY)
Sum(Field('amount'))
Avg(Field('rating'))
```

### Conditionals
```python
from pypika import Case

# CASE WHEN
(Case()
 .when(Field('amount') >= 1000, 'High')
 .when(Field('amount') >= 500, 'Medium')
 .else_('Low'))

# Case with calculations
(Case()
 .when(Field('status') == 'active', Field('price') * 1.1)
 .else_(Field('price')))
```

### Type Casting
```python
from pypika.functions import Cast

# Cast to different type
Cast(Field('text_number'), 'INTEGER')
Cast(Field('value'), 'DOUBLE')
```

### Example: Complex Expression
```python
from pypika import Query, Table, Field
from pypika.functions import Round, Coalesce, Case

table = Table('sales')

# Virtual column: adjusted_profit_margin
# Formula: ROUND(((revenue - COALESCE(cost, 0)) / revenue * 100), 2)
# With conditional: if status = 'premium', add 10% bonus

adjusted_profit_margin = Round(
    Case()
    .when(
        table.status == 'premium',
        ((table.revenue - Coalesce(table.cost, 0)) / table.revenue * 100) * 1.1
    )
    .else_(
        (table.revenue - Coalesce(table.cost, 0)) / table.revenue * 100
    ),
    2
).as_('adjusted_profit_margin')

query = Query.from_(table).select(
    table.product,
    adjusted_profit_margin
)

print(query.get_sql())
```

**Output:**
```sql
SELECT 
    "product",
    ROUND(
        CASE 
            WHEN "status"='premium' 
            THEN ((("revenue"-COALESCE("cost",0))/"revenue"*100)*1.1) 
            ELSE (("revenue"-COALESCE("cost",0))/"revenue"*100) 
        END,
        2
    ) "adjusted_profit_margin"
FROM "sales"
```

---

**Document Status:** 🔬 Research Complete - Ready for Design Decision
**Next Owner:** Architecture Team
**Target Decision Date:** TBD
