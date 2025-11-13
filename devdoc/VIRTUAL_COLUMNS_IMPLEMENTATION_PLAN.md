# Virtual Columns - Implementation Plan

## Overview

This document provides a detailed implementation plan for virtual columns using **Proposal 1** (string-based SQL expressions with Pypika translation).

**Status:** 📋 Implementation Ready  
**Approach:** Proposal 1 - Simple String Expressions  
**Related Doc:** [VIRTUAL_COLUMNS_RESEARCH.md](./VIRTUAL_COLUMNS_RESEARCH.md)

---

## Approved Specifications

Based on research decisions:

| Aspect | Decision |
|--------|----------|
| **Storage Level** | Query-level (saved with visualization JSON) |
| **Expression Language** | Level 3: Arithmetic + Functions + Conditionals (CASE WHEN) |
| **Column List Visibility** | Always visible, flagged with `is_virtual=true` |
| **Multi-table Support** | Support qualified names (`table.column`) |
| **VC-to-VC References** | Not supported (no dependencies) |
| **Error Handling** | Validation + Execution + NULL handling |
| **UI** | Simple text input |

---

## Implementation Phases

### Phase 1: Core Backend Infrastructure ⭐ START HERE

**Goal:** Implement basic virtual column support with arithmetic operations.

#### 1.1 Data Models

**File:** `backend/models/data_source.py`

```python
class VirtualColumnDefinition(BaseModel):
    """
    Definition of a virtual (calculated) column.
    
    Virtual columns are calculated from other columns using SQL expressions,
    evaluated at the database level for performance.
    
    Examples:
        # Simple arithmetic
        VirtualColumnDefinition(
            name="profit",
            expression="(revenue - cost)",
            output_type="DOUBLE"
        )
        
        # With functions
        VirtualColumnDefinition(
            name="rounded_price",
            expression="ROUND(price, 2)",
            output_type="DOUBLE"
        )
        
        # Conditional
        VirtualColumnDefinition(
            name="status_label",
            expression="CASE WHEN active = 1 THEN 'Active' ELSE 'Inactive' END",
            output_type="VARCHAR"
        )
    """
    name: str = Field(..., description="Name of the virtual column (must be unique)")
    expression: str = Field(..., description="SQL expression to calculate the column")
    output_type: Optional[str] = Field(None, description="Expected SQL data type (e.g., 'DOUBLE', 'VARCHAR', 'INTEGER')")
    description: Optional[str] = Field(None, description="Human-readable description of the column")
    
    @validator('name')
    def validate_name(cls, v):
        """Ensure name is a valid identifier."""
        if not v or not v[0].isalpha():
            raise ValueError("Virtual column name must start with a letter")
        if not all(c.isalnum() or c == '_' for c in v):
            raise ValueError("Virtual column name must contain only letters, numbers, and underscores")
        return v
    
    @validator('expression')
    def validate_expression_not_empty(cls, v):
        """Ensure expression is not empty."""
        if not v or not v.strip():
            raise ValueError("Expression cannot be empty")
        return v.strip()

    class Config:
        schema_extra = {
            "example": {
                "name": "profit",
                "expression": "(revenue - cost)",
                "output_type": "DOUBLE",
                "description": "Net profit calculated as revenue minus cost"
            }
        }
```

**File:** `backend/models/query.py`

```python
class QueryDescription(BaseModel):
    target_table: str
    target_database: Optional[str] = None
    dimensions: Optional[List[Dimension]] = None
    measures: Optional[List[Measure]] = None
    filters: Optional[List[Filter]] = None
    orderBy: Optional[List[OrderBy]] = None
    limit: Optional[int] = None
    
    # Existing fields...
    column_casts: Optional[Dict[str, Dict[str, str]]] = None
    virtual_table: Optional[VirtualTableDefinition] = None
    label_fields: Optional[List[str]] = None
    optimization_hints: Optional[OptimizationHints] = None
    
    # NEW: Virtual columns
    virtual_columns: Optional[List[VirtualColumnDefinition]] = None
```

**File:** `backend/models/data_source.py` (enhance Column model)

```python
class Column(BaseModel):
    name: str
    type: str
    
    # NEW: Flag for virtual columns
    is_virtual: Optional[bool] = Field(False, description="True if this is a virtual/calculated column")
    
    # Existing optional fields
    nullable: Optional[bool] = None
    description: Optional[str] = None
```

#### 1.2 Expression Parser/Builder

**File:** `backend/services/query_components/virtual_column_builder.py` (NEW)

```python
"""Builder for virtual column expressions using Pypika."""

from typing import Any, Dict, List, Optional, Set
import re
import logging

from pypika.terms import Term, Field, ValueWrapper
from pypika import Case
from pypika.functions import (
    Round, Abs, Coalesce, Concat, Upper, Lower, 
    Length, Substring, Cast
)

from backend.exceptions import QueryGenerationError
from backend.models.data_source import VirtualColumnDefinition

logger = logging.getLogger(__name__)


class VirtualColumnExpressionBuilder:
    """
    Converts virtual column string expressions to Pypika Terms.
    
    Supports:
    - Arithmetic: +, -, *, /, %
    - Comparison: =, !=, >, <, >=, <=
    - Logical: AND, OR, NOT
    - Functions: ROUND, ABS, COALESCE, CONCAT, UPPER, LOWER, etc.
    - Conditionals: CASE WHEN ... THEN ... ELSE ... END
    - Qualified column names: table.column
    """
    
    def __init__(self, table_map: Dict[str, Any], default_table: Any):
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
        For production, consider using a proper SQL parser library.
        
        Args:
            expression: SQL expression string
            
        Returns:
            Pypika Term object
            
        Raises:
            ValueError: If expression is invalid
        """
        # Validate expression for security
        self._validate_expression_safety(expression)
        
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
        
        # Evaluate expression
        try:
            result = eval(expression, {"__builtins__": {}}, namespace)
            
            if not isinstance(result, Term):
                # Wrap literals
                result = ValueWrapper(result)
            
            return result
            
        except Exception as e:
            raise ValueError(f"Failed to evaluate expression: {e}")
    
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
            'MIN', 'MAX', 'FLOOR', 'CEIL', 'SQRT', 'POW', 'MOD'
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
        for col_ref in column_refs:
            namespace[col_ref] = self._get_field_reference(col_ref)
        
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
        })
        
        # Add Python operators (already work with Pypika Terms)
        # +, -, *, /, %, ==, !=, >, <, >=, <= are all overloaded in Pypika
        
        return namespace
    
    def _get_field_reference(self, field_name: str) -> Field:
        """
        Get Pypika Field reference for a column name.
        
        Supports qualified names: table.column
        
        Args:
            field_name: Column name, optionally qualified
            
        Returns:
            Pypika Field object
        """
        if '.' in field_name:
            # Qualified name: table.column
            table_name, column_name = field_name.split('.', 1)
            table = self.table_map.get(table_name, self.default_table)
            return table[column_name]
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
```

#### 1.3 QueryService Integration

**File:** `backend/services/query_service.py`

```python
class QueryService:
    
    def translate_to_sql(
        self, 
        query_desc: QueryDescription, 
        table_name: str, 
        db_type: str = 'clickhouse',
        with_sampling: bool = False,
        with_optimization: bool = True,
        optimizer: Optional[Any] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Translates a QueryDescription object into a SQL string.
        
        Enhanced with virtual column support.
        """
        # ... existing code ...
        
        # Build table context
        table_ctx = self._build_table_context(query_desc, db_type, table_name)
        
        # NEW: Initialize virtual column builder if virtual columns are defined
        vc_builder = None
        if query_desc.virtual_columns:
            vc_builder = VirtualColumnExpressionBuilder(
                table_map=table_ctx.table_map,
                default_table=table_ctx.default_table
            )
            
            # Register all virtual columns
            for vc in query_desc.virtual_columns:
                try:
                    vc_builder.register_virtual_column(vc)
                except QueryGenerationError as e:
                    logger.error(f"Failed to register virtual column '{vc.name}': {e}")
                    raise
        
        # Build optimization context
        opt_ctx = self._build_optimization_context(
            query_desc, optimizer, with_optimization
        )
        
        # Build SELECT clause (pass vc_builder)
        select_result = self._build_select_clause(
            query_desc=query_desc,
            table_map=table_ctx.table_map,
            default_table=table_ctx.default_table,
            db_type=db_type,
            rounding_config=opt_ctx.rounding_config,
            binning_config=opt_ctx.binning_config,
            use_category_dedup=opt_ctx.use_category_dedup,
            vc_builder=vc_builder  # NEW parameter
        )
        
        # Build filter criteria (pass vc_builder)
        filter_criteria = self._build_filter_criteria(
            query_desc=query_desc,
            table_map=table_ctx.table_map,
            default_table=table_ctx.default_table,
            db_type=db_type,
            primary_table=table_ctx.primary_table,
            vc_builder=vc_builder  # NEW parameter
        )
        
        # ... rest of method unchanged ...
    
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
        # NEW: Check if this is a virtual column
        if vc_builder and vc_builder.is_virtual_column(field_name):
            vc_term = vc_builder.get_virtual_column_term(field_name)
            if vc_term:
                logger.debug(f"Resolved '{field_name}' as virtual column")
                return vc_term
        
        # Existing logic for regular columns
        if '.' in field_name:
            table_name, column_name = field_name.split('.', 1)
            table = table_map.get(table_name)
            if table:
                return table[column_name]
            raise QueryGenerationError(f"Table '{table_name}' not found in query context")
        else:
            return default_table[field_name]
```

**File:** `backend/services/query_components/select_builder.py`

```python
class SelectClauseBuilder:
    
    def build(
        self,
        query_desc: QueryDescription,
        table_map: Dict[str, Any],
        default_table: Any,
        db_type: str,
        rounding_config: Dict[str, Any],
        binning_config: Dict[str, Any],
        use_category_dedup: bool,
        aggregation_map: Dict[str, Callable[[Any], Any]],
        vc_builder: Optional[VirtualColumnExpressionBuilder] = None  # NEW parameter
    ) -> SelectClauseResult:
        """
        Build SELECT clause with virtual column support.
        """
        # Pass vc_builder to _parse_field_reference calls
        # This is already passed via the constructor's parse_field_reference callback
        
        # The rest of the logic remains the same, as field parsing is delegated
        # to the injected _parse_field_reference method
        # ... existing code unchanged ...
```

**Update constructor call in QueryService:**

```python
def _build_select_clause(
    self,
    query_desc: QueryDescription,
    table_map: Dict[str, Any],
    default_table: Any,
    db_type: str,
    rounding_config: Dict[str, Any],
    binning_config: Dict[str, Any],
    use_category_dedup: bool,
    vc_builder: Optional[VirtualColumnExpressionBuilder] = None  # NEW
) -> SelectClauseResult:
    """Assemble SELECT fields and related alias/grouping metadata."""
    
    # Create a closure that includes vc_builder
    def parse_field_with_vc(field_name: str, table_map: Dict[str, Any], default_table: Any) -> Any:
        return self._parse_field_reference(field_name, table_map, default_table, vc_builder)
    
    builder = SelectClauseBuilder(
        parse_field_reference=parse_field_with_vc,  # Use closure
        apply_cast_if_configured=self._apply_cast_if_configured,
        get_datetime_part_expression=self._get_datetime_part_expression,
    )
    
    return builder.build(
        query_desc=query_desc,
        table_map=table_map,
        default_table=default_table,
        db_type=db_type,
        rounding_config=rounding_config,
        binning_config=binning_config,
        use_category_dedup=use_category_dedup,
        aggregation_map=AGGREGATION_MAP,
        vc_builder=vc_builder  # Pass through
    )
```

Similar updates for `FilterBuilder`.

#### 1.4 Column List Enhancement

**File:** `backend/routers/data.py`

```python
@router.get("/columns", response_model=ColumnListResponse)
def list_columns(
    table: str,
    database: Optional[str] = None,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details),
    # NEW: Query parameter to include virtual columns from current session/query
    # For now, we won't include them here since they're query-specific
    # Frontend will merge virtual columns from query definition
):
    """List columns for the selected table (and database if applicable)."""
    
    # Existing logic - returns real columns only
    # Virtual columns are query-specific, so they're not included here
    # Frontend will display them separately or merge them
    
    columns = connector.list_columns(database, table)
    return ColumnListResponse(columns=columns)
```

**Note:** Since virtual columns are query-specific (not connection-level), they won't appear in the `/columns` endpoint. Instead, the frontend will track them separately in the query/visualization state.

---

### Phase 2: Frontend Integration

**Goal:** Add UI for creating and using virtual columns.

#### 2.1 Type Definitions

**File:** `frontend/src/types.ts`

```typescript
// Add to existing types

export interface VirtualColumnDefinition {
  name: string;
  expression: string;
  output_type?: string;
  description?: string;
}

// Update QueryDescription
export interface QueryDescription {
  target_table: string;
  target_database?: string;
  dimensions?: Dimension[];
  measures?: Measure[];
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  column_casts?: Record<string, {cast_type: string; replacement_pattern?: string}>;
  virtual_table?: VirtualTableDefinition;
  label_fields?: string[];
  optimization_hints?: OptimizationHints;
  
  // NEW
  virtual_columns?: VirtualColumnDefinition[];
}
```

#### 2.2 Virtual Column Manager Component

**File:** `frontend/src/components/VirtualColumns/VirtualColumnManager.tsx` (NEW)

```typescript
import React, { useState } from 'react';
import { VirtualColumnDefinition } from '../../types';
import styles from './VirtualColumnManager.module.css';

interface VirtualColumnManagerProps {
  virtualColumns: VirtualColumnDefinition[];
  onAdd: (vc: VirtualColumnDefinition) => void;
  onRemove: (name: string) => void;
  onUpdate: (oldName: string, vc: VirtualColumnDefinition) => void;
}

export function VirtualColumnManager({
  virtualColumns,
  onAdd,
  onRemove,
  onUpdate
}: VirtualColumnManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newVC, setNewVC] = useState<Partial<VirtualColumnDefinition>>({
    name: '',
    expression: '',
    output_type: 'DOUBLE',
    description: ''
  });

  const handleAdd = () => {
    if (!newVC.name || !newVC.expression) {
      alert('Name and expression are required');
      return;
    }

    onAdd({
      name: newVC.name,
      expression: newVC.expression,
      output_type: newVC.output_type,
      description: newVC.description
    });

    // Reset form
    setNewVC({
      name: '',
      expression: '',
      output_type: 'DOUBLE',
      description: ''
    });
    setIsAdding(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Virtual Columns</h3>
        <button 
          className={styles.addButton}
          onClick={() => setIsAdding(!isAdding)}
        >
          {isAdding ? 'Cancel' : '+ Add Virtual Column'}
        </button>
      </div>

      {isAdding && (
        <div className={styles.form}>
          <div className={styles.formField}>
            <label>Name:</label>
            <input
              type="text"
              value={newVC.name || ''}
              onChange={(e) => setNewVC({...newVC, name: e.target.value})}
              placeholder="e.g., profit"
            />
          </div>

          <div className={styles.formField}>
            <label>Expression:</label>
            <input
              type="text"
              value={newVC.expression || ''}
              onChange={(e) => setNewVC({...newVC, expression: e.target.value})}
              placeholder="e.g., (revenue - cost)"
              className={styles.expressionInput}
            />
            <span className={styles.hint}>
              Use SQL syntax. Examples: (a + b), ROUND(price, 2), 
              CASE WHEN amount > 100 THEN 'High' ELSE 'Low' END
            </span>
          </div>

          <div className={styles.formField}>
            <label>Output Type:</label>
            <select
              value={newVC.output_type || 'DOUBLE'}
              onChange={(e) => setNewVC({...newVC, output_type: e.target.value})}
            >
              <option value="DOUBLE">DOUBLE (numbers with decimals)</option>
              <option value="INTEGER">INTEGER (whole numbers)</option>
              <option value="VARCHAR">VARCHAR (text)</option>
              <option value="BIGINT">BIGINT (large integers)</option>
              <option value="DATE">DATE</option>
              <option value="TIMESTAMP">TIMESTAMP</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label>Description (optional):</label>
            <input
              type="text"
              value={newVC.description || ''}
              onChange={(e) => setNewVC({...newVC, description: e.target.value})}
              placeholder="What does this column calculate?"
            />
          </div>

          <div className={styles.formActions}>
            <button className={styles.saveButton} onClick={handleAdd}>
              Add Column
            </button>
          </div>
        </div>
      )}

      {virtualColumns.length > 0 && (
        <div className={styles.list}>
          {virtualColumns.map((vc) => (
            <div key={vc.name} className={styles.virtualColumnItem}>
              <div className={styles.vcInfo}>
                <strong>{vc.name}</strong>
                <code className={styles.expression}>{vc.expression}</code>
                {vc.description && (
                  <span className={styles.description}>{vc.description}</span>
                )}
                <span className={styles.type}>{vc.output_type || 'DOUBLE'}</span>
              </div>
              <button
                className={styles.removeButton}
                onClick={() => onRemove(vc.name)}
                title="Remove virtual column"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 2.3 Integrate into Visualization State

**File:** `frontend/src/hooks/useVisualizationState.ts`

```typescript
// Add to state
const [virtualColumns, setVirtualColumns] = useState<VirtualColumnDefinition[]>([]);

// Add handlers
const addVirtualColumn = useCallback((vc: VirtualColumnDefinition) => {
  setVirtualColumns(prev => [...prev, vc]);
}, []);

const removeVirtualColumn = useCallback((name: string) => {
  setVirtualColumns(prev => prev.filter(vc => vc.name !== name));
}, []);

const updateVirtualColumn = useCallback((oldName: string, vc: VirtualColumnDefinition) => {
  setVirtualColumns(prev => 
    prev.map(existing => existing.name === oldName ? vc : existing)
  );
}, []);

// Include in return
return {
  // ... existing returns ...
  virtualColumns,
  addVirtualColumn,
  removeVirtualColumn,
  updateVirtualColumn,
};
```

#### 2.4 Update Query Builder

**File:** `frontend/src/queryBuilder/queryBuilder.ts`

```typescript
export const buildQuery = ({
  fields,
  selectedTable,
  selectedDatabase,
  filterConfigurations = {},
  labelFields = [],
  virtualTable = null,
  virtualColumns = [],  // NEW parameter
}: {
  fields: Field[];
  selectedTable: string;
  selectedDatabase?: string;
  filterConfigurations?: Record<string, FilterConfig>;
  labelFields?: Field[];
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];  // NEW
}): QueryDescription | null => {
  const queryType = getQueryTypeFromFields(fields);
  
  const baseQuery = queryType === 'aggregated'
    ? buildAggregatedQuery({ fields, selectedTable, selectedDatabase, filterConfigurations, labelFields, virtualTable })
    : buildRawQuery({ fields, selectedTable, selectedDatabase, filterConfigurations, labelFields, virtualTable });
  
  if (!baseQuery) return null;
  
  // Add virtual columns to query
  if (virtualColumns && virtualColumns.length > 0) {
    baseQuery.virtual_columns = virtualColumns;
  }
  
  return baseQuery;
};
```

---

### Phase 3: Testing & Validation

#### 3.1 Unit Tests

**File:** `backend/tests/unit/services/test_virtual_column_builder.py` (NEW)

```python
"""Unit tests for VirtualColumnExpressionBuilder."""

import pytest
from pypika import Table
from backend.services.query_components.virtual_column_builder import VirtualColumnExpressionBuilder
from backend.models.data_source import VirtualColumnDefinition
from backend.exceptions import QueryGenerationError


def test_simple_arithmetic():
    """Test basic arithmetic operations."""
    table = Table('sales')
    builder = VirtualColumnExpressionBuilder({'sales': table}, table)
    
    vc = VirtualColumnDefinition(
        name='profit',
        expression='(revenue - cost)',
        output_type='DOUBLE'
    )
    
    term = builder.register_virtual_column(vc)
    sql = term.get_sql(quote_char='"')
    
    assert 'revenue' in sql
    assert 'cost' in sql
    assert 'CAST' in sql  # Because output_type is specified


def test_function_call():
    """Test function calls."""
    table = Table('sales')
    builder = VirtualColumnExpressionBuilder({'sales': table}, table)
    
    vc = VirtualColumnDefinition(
        name='rounded_price',
        expression='ROUND(price, 2)',
    )
    
    term = builder.register_virtual_column(vc)
    sql = term.get_sql(quote_char='"')
    
    assert 'ROUND' in sql
    assert 'price' in sql


def test_case_when():
    """Test CASE WHEN conditional."""
    table = Table('sales')
    builder = VirtualColumnExpressionBuilder({'sales': table}, table)
    
    vc = VirtualColumnDefinition(
        name='category',
        expression='CASE().when(amount > 100, "High").else_("Low")',
    )
    
    term = builder.register_virtual_column(vc)
    sql = term.get_sql(quote_char='"')
    
    assert 'CASE' in sql


def test_qualified_column_names():
    """Test table.column syntax."""
    table1 = Table('orders')
    table2 = Table('customers')
    builder = VirtualColumnExpressionBuilder(
        {'orders': table1, 'customers': table2}, 
        table1
    )
    
    vc = VirtualColumnDefinition(
        name='value_per_customer',
        expression='(orders.total / customers.count)',
    )
    
    term = builder.register_virtual_column(vc)
    # Should not raise error


def test_forbidden_keywords():
    """Test that dangerous SQL is rejected."""
    table = Table('sales')
    builder = VirtualColumnExpressionBuilder({'sales': table}, table)
    
    dangerous_expressions = [
        'DROP TABLE users',
        'DELETE FROM sales',
        'revenue; DROP TABLE users',
    ]
    
    for expr in dangerous_expressions:
        vc = VirtualColumnDefinition(name='test', expression=expr)
        with pytest.raises(QueryGenerationError):
            builder.register_virtual_column(vc)


def test_no_virtual_column_references():
    """Test that virtual columns cannot reference other virtual columns."""
    table = Table('sales')
    builder = VirtualColumnExpressionBuilder({'sales': table}, table)
    
    # Register first VC
    vc1 = VirtualColumnDefinition(name='profit', expression='(revenue - cost)')
    builder.register_virtual_column(vc1)
    
    # Try to reference it in second VC
    vc2 = VirtualColumnDefinition(name='margin', expression='(profit / revenue)')
    
    with pytest.raises(QueryGenerationError, match='cannot reference other virtual columns'):
        builder.register_virtual_column(vc2)


def test_duplicate_names():
    """Test that duplicate virtual column names are rejected."""
    table = Table('sales')
    builder = VirtualColumnExpressionBuilder({'sales': table}, table)
    
    vc1 = VirtualColumnDefinition(name='profit', expression='(revenue - cost)')
    builder.register_virtual_column(vc1)
    
    vc2 = VirtualColumnDefinition(name='profit', expression='(price * quantity)')
    
    with pytest.raises(QueryGenerationError, match='Duplicate'):
        builder.register_virtual_column(vc2)
```

#### 3.2 Integration Tests

**File:** `backend/tests/integration/test_virtual_columns_query.py` (NEW)

```python
"""Integration tests for virtual columns in queries."""

import pytest
from backend.models.query import QueryDescription, Dimension, Measure
from backend.models.data_source import VirtualColumnDefinition
from backend.services.query_service import QueryService


def test_virtual_column_as_dimension():
    """Test using virtual column as a dimension."""
    query_desc = QueryDescription(
        target_table='sales',
        dimensions=[
            Dimension(field='profit_category', flavour='discrete')
        ],
        measures=[
            Measure(field='revenue', aggregation='sum', alias='total_revenue')
        ],
        virtual_columns=[
            VirtualColumnDefinition(
                name='profit_category',
                expression='CASE().when(revenue - cost > 1000, "High").else_("Low")',
                output_type='VARCHAR'
            )
        ]
    )
    
    service = QueryService()
    sql, metadata = service.translate_to_sql(
        query_desc=query_desc,
        table_name='sales',
        db_type='duckdb'
    )
    
    # Should not raise error
    assert 'CASE' in sql
    assert 'revenue' in sql


def test_virtual_column_as_measure():
    """Test using virtual column as a measure."""
    query_desc = QueryDescription(
        target_table='sales',
        dimensions=[
            Dimension(field='product', flavour='discrete')
        ],
        measures=[
            Measure(field='profit', aggregation='sum', alias='total_profit')
        ],
        virtual_columns=[
            VirtualColumnDefinition(
                name='profit',
                expression='(revenue - cost)',
                output_type='DOUBLE'
            )
        ]
    )
    
    service = QueryService()
    sql, metadata = service.translate_to_sql(
        query_desc=query_desc,
        table_name='sales',
        db_type='duckdb'
    )
    
    assert 'SUM' in sql
    assert 'revenue' in sql
    assert 'cost' in sql
```

---

### Phase 4: Documentation & Examples

#### 4.1 User Guide

**File:** `devdoc/VIRTUAL_COLUMNS_USER_GUIDE.md` (NEW)

Create comprehensive user documentation with:
- What are virtual columns
- How to create them
- Expression syntax guide
- Common examples
- Troubleshooting

#### 4.2 API Documentation

Update `backend/README.md` and `frontend/api.md` with virtual column endpoints and usage.

---

## Implementation Checklist

### Phase 1: Backend Core ✅ Priority
- [ ] Add `VirtualColumnDefinition` model to `backend/models/data_source.py`
- [ ] Add `virtual_columns` field to `QueryDescription` in `backend/models/query.py`
- [ ] Add `is_virtual` field to `Column` model
- [ ] Create `backend/services/query_components/virtual_column_builder.py`
- [ ] Update `QueryService.translate_to_sql()` to initialize VC builder
- [ ] Update `QueryService._parse_field_reference()` to check virtual columns
- [ ] Update `SelectClauseBuilder` to accept and use vc_builder
- [ ] Update `FilterBuilder` to accept and use vc_builder
- [ ] Add unit tests for `VirtualColumnExpressionBuilder`
- [ ] Add integration tests for queries with virtual columns

### Phase 2: Frontend ⏳ Next
- [ ] Add `VirtualColumnDefinition` type to `frontend/src/types.ts`
- [ ] Update `QueryDescription` type with `virtual_columns` field
- [ ] Create `VirtualColumnManager` component
- [ ] Add state management in `useVisualizationState`
- [ ] Update query builder to include virtual columns
- [ ] Add UI in visualization page to manage virtual columns
- [ ] Test end-to-end flow

### Phase 3: Testing 🧪 Final
- [ ] Write comprehensive unit tests
- [ ] Write integration tests
- [ ] Test with ClickHouse
- [ ] Test with DuckDB/CSV files
- [ ] Test error scenarios
- [ ] Performance testing with complex expressions

### Phase 4: Documentation 📚
- [ ] Create user guide
- [ ] Update API documentation
- [ ] Add code examples
- [ ] Add troubleshooting section

---

## Security Considerations

### Expression Validation

The `_validate_expression_safety()` method prevents:
- DDL/DML statements (DROP, DELETE, INSERT, etc.)
- SQL comments (`--`, `/* */`)
- Statement separators (`;`)
- Python special methods (`__`)

### Eval Safety

The restricted eval uses:
- `{"__builtins__": {}}` to prevent access to Python built-ins
- Controlled namespace with only Pypika objects
- Column reference extraction and validation

### Future Enhancements

For production hardening, consider:
1. **SQL Parser Library**: Use `sqlparse` or similar for robust parsing
2. **Expression Complexity Limits**: Prevent extremely complex expressions
3. **Execution Timeout**: Database query timeout for runaway calculations
4. **Rate Limiting**: Limit number of virtual columns per query

---

## Performance Considerations

### Database-Level Calculation

Virtual columns are calculated in the database using native SQL, which means:
- ✅ Vectorized operations
- ✅ Query optimizer can optimize the full expression
- ✅ No data transfer overhead

### Optimization Interaction

Virtual columns work seamlessly with existing optimizations:
- Rounding strategies apply to virtual column aggregations
- Binning works on virtual datetime columns
- Sampling applies before virtual column calculation

### Potential Bottlenecks

Watch for:
- Very complex CASE WHEN with many conditions
- String operations on large text columns
- Nested function calls

Mitigation: Monitor query execution time and add complexity warnings.

---

## Error Handling

### Validation Errors

Caught during expression parsing:
- Invalid syntax
- Forbidden keywords
- References to non-existent columns
- References to other virtual columns
- Duplicate names

**Response:** HTTP 400 with detailed error message

### Execution Errors

Caught during query execution:
- Division by zero
- Type mismatches
- NULL handling issues

**Response:** HTTP 500 with formatted database error

### Frontend Error Display

Show user-friendly messages:
- Highlight problematic expression
- Suggest corrections
- Link to documentation

---

## Future Enhancements

### Short Term
- Expression syntax highlighting in UI
- Autocomplete for column names
- Expression validation before saving

### Medium Term
- Expression library/templates
- Share virtual columns between users
- Virtual column versioning

### Long Term
- Visual expression builder
- AI-assisted expression generation
- Persistent virtual column definitions

---

## Summary

This implementation plan provides a complete roadmap for adding virtual columns to the data-slicer application using Proposal 1 (string-based expressions with Pypika). The approach:

1. **Leverages existing infrastructure** (Pypika, query builder pattern)
2. **Maintains security** (expression validation, restricted eval)
3. **Provides flexibility** (Level 3 expressions with conditionals)
4. **Ensures performance** (database-level calculations)
5. **Integrates cleanly** (query-level storage, visualization JSON)

Start with Phase 1 backend implementation to validate the approach, then proceed to frontend and testing phases.

---

**Status:** 📋 Ready for Implementation  
**Estimated Effort:** 3-4 sprints (backend: 1-2, frontend: 1, testing/docs: 1)  
**Risk Level:** Medium (expression parsing security, error handling complexity)
