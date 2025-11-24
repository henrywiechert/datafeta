# Source Tracking Fields - Always Available Implementation

## Summary

The `_source_database` and `_source_table` virtual fields are now **always available** for all tables (single, joined, or unioned). This prevents charts from breaking when unions are removed.

## Problem Solved

**Before:** These fields only existed when tables were unioned. Removing unions caused charts using these dimensions to break with query errors.

**After:** These fields are always present:
- **Single table**: Contains the database and table name as constants
- **Multiple tables (UNION)**: Contains the actual source of each row (as before)
- **File connectors (CSV)**: `_source_database` is empty string, `_source_table` is filename

## Implementation Details

### 1. Columns Endpoint (`backend/routers/data.py`)

**KEY CHANGE:** The `/api/v1/data/columns` endpoint now always appends source tracking fields.

```python
@router.get("/columns", response_model=ColumnListResponse)
def list_columns(...):
    columns = connector.list_columns(database=database, table=table)
    
    # Always add _source_database and _source_table virtual columns
    source_database_column = Column(
        name='_source_database',
        data_type='String',
        is_datetime=False,
        table_name=None
    )
    source_table_column = Column(
        name='_source_table',
        data_type='String',
        is_datetime=False,
        table_name=None
    )
    columns.append(source_database_column)
    columns.append(source_table_column)
    
    return ColumnListResponse(columns=columns)
```

**Impact:** Frontend always sees these fields in the available columns list.

### 2. Table Merge Service (`backend/services/table_merge_service.py`)

Changed to add source columns for **all modes** (not just union):

```python
# Get merged columns
result = self.get_merged_columns(database, virtual_table)

# Add the virtual _source_database and _source_table columns for ALL modes
source_database_column = Column(...)
source_table_column = Column(...)
result.columns.append(source_database_column)
result.columns.append(source_table_column)
```

**Impact:** Merged columns endpoint also includes these fields for joins and single tables.

### 3. Query Service (`backend/services/query_service.py`)

No changes needed - source tracking is handled in the SELECT builder.

**Impact:** Query generation unchanged, source fields handled at SELECT clause level.

### 4. Select Builder (`backend/services/query_components/select_builder.py`)

**KEY CHANGE:** Source tracking fields are now added as **literal values directly in the SELECT clause**:

```python
if dim.field == "_source_database":
    # Add as literal value using PyPika
    from pypika.terms import ValueWrapper
    database_value = query_desc.target_database or ''  # Empty for file connectors
    field_term = ValueWrapper(database_value).as_(dim.field)
    select_fields.append(field_term)
    all_aliases.add(dim.field)
    continue

if dim.field == "_source_table":
    # Add as literal value using PyPika
    from pypika.terms import ValueWrapper
    table_value = query_desc.target_table
    field_term = ValueWrapper(table_value).as_(dim.field)
    select_fields.append(field_term)
    all_aliases.add(dim.field)
    continue
```

**Impact:** Source fields are added BEFORE GROUP BY, ORDER BY, etc., so they can be used in those clauses. This fixes the "UNKNOWN_IDENTIFIER" error.

### 5. Cardinality Service (`backend/services/cardinality_service.py`)

Updated to return correct counts for single tables:

```python
def _count_source_tables(self, union_tables: Optional[str]) -> int:
    if union_tables:
        # Multiple tables in union
        union_table_list = [t.strip() for t in union_tables.split(',') if t.strip()]
        return 1 + len(union_table_list)
    else:
        # Single table case - always return 1
        return 1  # Changed from 0

def _count_source_databases(self, union_tables: Optional[str]) -> int:
    if union_tables:
        # Count unique databases in union
        ...
    else:
        # Single table case - always return 1
        return 1
```

**Impact:** Cardinality queries work correctly for single-table source fields.

## Complete Flow

### Single Table (ClickHouse)

1. **User selects table "orders" in database "production"**
2. **Frontend calls `/columns?table=orders&database=production`**
3. **Response includes:**
   ```json
   {
     "columns": [
       {"name": "id", "data_type": "Int64", ...},
       {"name": "customer", "data_type": "String", ...},
       {"name": "_source_database", "data_type": "String", ...},
       {"name": "_source_table", "data_type": "String", ...}
     ]
   }
   ```
4. **User drags `_source_table` to chart dimensions**
5. **Frontend sends query with dimensions: ["customer", "_source_table"]**
6. **Backend generates SQL:**
   ```sql
   SELECT "customer", 'orders' AS "_source_table"
   FROM "production"."orders"
   GROUP BY "customer", "_source_table"
   ORDER BY "_source_table" ASC
   ```
7. **Result:**
   - All rows have `_source_table = "orders"`
   - Chart displays correctly
   - Note: `_source_table` can be used in GROUP BY and ORDER BY because it's a literal in SELECT

### Single Table (CSV File)

1. **User uploads CSV file "sales_data.csv"**
2. **Frontend calls `/columns?table=sales_data&database=null`**
3. **Response includes source fields**
4. **Query generates:**
   ```sql
   SELECT "customer", '' AS "_source_database", 'sales_data' AS "_source_table"
   FROM "sales_data"
   GROUP BY "customer", "_source_database", "_source_table"
   ```
5. **Result:**
   - `_source_database = ""` (empty string for files)
   - `_source_table = "sales_data"`
   - Literals in SELECT can be referenced in GROUP BY

### Multiple Tables (Union) - Unchanged Behavior

1. **User creates union of sales_2023, sales_2024, sales_2025**
2. **Columns include source fields (as before)**
3. **Query uses UnionQueryBuilder (as before)**
4. **Result:**
   - Each row has its actual source database and table
   - Works exactly as it did before

## Testing

Added comprehensive unit tests in `backend/tests/unit/services/query/test_union_query_builder.py`:

- `test_single_table_query_adds_source_table_column()` ✓
- `test_single_table_query_adds_source_database_column()` ✓
- `test_single_table_query_adds_both_source_columns()` ✓
- `test_file_connector_empty_database()` ✓
- `test_union_query_injects_source_table_column()` ✓ (existing test still passes)

## Benefits

✅ **No Breaking Changes:** Charts using these fields in unions continue to work
✅ **No Breaking When Removing Unions:** Charts using these fields stay valid
✅ **Consistent API:** These fields are always available, regardless of table count
✅ **File Connector Support:** Automatically uses empty database name
✅ **Minimal Performance Impact:** Only wraps SQL when these fields are actually used

## Files Modified

1. `backend/routers/data.py` - Always add source columns in `/columns` endpoint
2. `backend/services/table_merge_service.py` - Add source columns for all modes
3. `backend/services/query_components/select_builder.py` - **Add source fields as literals in SELECT clause**
4. `backend/services/cardinality_service.py` - Return 1 for single-table cardinality
5. `backend/tests/unit/services/query/test_union_query_builder.py` - Added comprehensive tests

## Key Technical Details

### Why Literals in SELECT Clause?

The source tracking fields must be added as **literal values in the SELECT clause** (not wrapped afterward) because:

1. **GROUP BY requires them:** When `_source_table` is used as a dimension, it appears in the GROUP BY clause
2. **ORDER BY requires them:** These fields can be used for sorting
3. **Database validation:** ClickHouse validates that all GROUP BY columns exist in the SELECT clause

**Wrong Approach (causes errors):**
```sql
-- This fails because _source_table doesn't exist in the base query
SELECT * FROM (
  SELECT sum(amount) FROM orders GROUP BY _source_table  -- ERROR: column doesn't exist
) AS base
```

**Correct Approach:**
```sql
-- This works because _source_table is defined as a literal in SELECT
SELECT 'orders' AS _source_table, sum(amount)
FROM orders
GROUP BY _source_table  -- OK: _source_table is in SELECT
```

## Usage Examples

### Example 1: Single Table Chart

User creates a bar chart:
- X-axis: `customer` (dimension)
- Color: `_source_table` (dimension)
- Y-axis: `SUM(amount)` (measure)

**Result:** All bars are colored the same (single table), but chart doesn't break when unions are removed.

### Example 2: Union Chart → Single Table

1. User creates union of `sales_2023`, `sales_2024`, `sales_2025`
2. Creates chart with `_source_table` as color dimension
3. Chart shows data from all 3 tables in different colors
4. User removes unions, leaving only `sales_2023`
5. **Before fix:** Chart breaks with query error
6. **After fix:** Chart continues to work, all data colored the same

### Example 3: CSV File

1. User uploads `customer_data.csv`
2. Creates chart with `_source_table` dimension
3. All rows show `_source_table = "customer_data"`
4. `_source_database` is empty string (no database for files)

## Backward Compatibility

✅ **Existing queries without source fields:** No change, not wrapped
✅ **Existing union queries:** Continue to work exactly as before
✅ **Frontend:** No changes required, fields automatically appear
✅ **API contracts:** Response includes additional columns (additive change)

## Deployment Notes

- No database migrations required
- No configuration changes required
- Backend-only change (frontend compatible)
- Can be deployed independently
- All existing functionality preserved

