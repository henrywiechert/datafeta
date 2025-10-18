# Column Casting Solution for Quoted Numbers and Special Formats

## Problem

CSV files sometimes contain numbers in special formats that aren't automatically detected correctly by DuckDB:

- **Quoted numbers with thousands separators**: `"217,351"` detected as VARCHAR (string) instead of numeric
- **Custom number formats**: Scientific notation, percentages with symbols, etc.
- **Regional formats**: Comma as decimal separator in European CSVs

DuckDB's `read_csv_auto()` detects based on the raw string value. Without pre-processing, these values remain strings and aggregations (SUM, AVG) fail.

## Solution

**Column-level casting configuration** that applies CAST operations at query time:

```python
# In QueryDescription:
column_casts: {
    "Revenue": {
        "cast_type": "DOUBLE",
        "replacement_pattern": ","  # Remove thousands separator before casting
    },
    "Units Sold": {
        "cast_type": "BIGINT"
    }
}
```

This generates SQL like:
```sql
SELECT 
    CAST(REPLACE(Revenue, ',', '') AS DOUBLE) as Revenue,
    CAST(REPLACE("Units Sold", ',', '') AS BIGINT) as "Units Sold",
    SUM(CAST(REPLACE(Revenue, ',', '') AS DOUBLE)) as revenue_sum
FROM table
```

## Architecture

### 1. Data Models

**`ConnectionDetails` model** (`backend/models/data_source.py`):
```python
column_casts: Optional[Dict[str, Dict[str, str]]] = None
# Maps column_name to {cast_type, replacement_pattern}
# Example: {'Revenue': {'cast_type': 'DOUBLE', 'replacement_pattern': ','}}
```

**`Column` model** (`backend/models/data_source.py`):
- `cast_type`: Target type (DOUBLE, BIGINT, INTEGER, DECIMAL, etc.)
- `cast_replacement`: Optional regex/pattern to remove before casting

**`QueryDescription` model** (`backend/models/query.py`):
```python
column_casts: Optional[Dict[str, Dict[str, str]]] = None
```

### 2. Query Service

**New `CastField` class** (`backend/services/query_service.py`):
```python
class CastField(Term):
    """Custom pypika term for CAST(field AS type) with optional string replacement."""
    def __init__(self, field: Term, cast_type: str, replacement_pattern: Optional[str] = None):
        super().__init__()
        self.field = field
        self.cast_type = cast_type
        self.replacement_pattern = replacement_pattern
    
    def get_sql(self, **kwargs) -> str:
        # Renders as:
        # - CAST(REPLACE(field, 'pattern', '') AS type)  if replacement_pattern
        # - CAST(field AS type)                            otherwise
```

**New `_get_field_with_cast()` method** (`backend/services/query_service.py`):
```python
def _get_field_with_cast(self, table, field_name, column_casts=None):
    """Get field reference, applying CAST if configured."""
    field = table[field_name]
    
    if column_casts and field_name in column_casts:
        cast_config = column_casts[field_name]
        cast_type = cast_config.get('cast_type')
        replacement_pattern = cast_config.get('replacement_pattern')
        
        if cast_type:
            return CastField(field, cast_type, replacement_pattern)
    
    return field
```

### 3. Query Building Integration

Applied at **four points** in `translate_to_sql()`:

1. **Dimensions** (line ~305):
   ```python
   field_term = self._get_field_with_cast(t, dim.field, query_desc.column_casts)
   ```

2. **Measures** (line ~360):
   ```python
   field_term = self._get_field_with_cast(t, measure.field, query_desc.column_casts)
   agg_term = agg_func_builder(field_term)  # SUM(CAST(...)), AVG(CAST(...)), etc.
   ```

3. **Filters** (line ~390):
   ```python
   field = self._get_field_with_cast(t, f.field, query_desc.column_casts)
   criteria.append(operator_func(field, value))
   ```

4. **Null filters** (line ~423):
   ```python
   dim_field = self._get_field_with_cast(t, dim.field, query_desc.column_casts)
   criteria.append(dim_field.notnull())
   ```

## Usage Examples

### Example 1: Quoted Numbers with Thousands Separator

**CSV Data:**
```
Period start time,Cell avail R,Cell available,Revenue
08.22.2025,"100.00","100.00","217,351"
08.22.2025,"99.98","99.98","192,615"
```

**Frontend Configuration:**
```json
{
  "column_casts": {
    "Revenue": {
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    },
    "Cell avail R": {
      "cast_type": "DOUBLE",
      "replacement_pattern": ","
    }
  }
}
```

**Generated Query:**
```sql
SELECT 
    "Period start time",
    CAST(REPLACE("Cell avail R", ',', '') AS DOUBLE) as "Cell avail R",
    CAST(REPLACE("Cell available", ',', '') AS DOUBLE) as "Cell available",
    CAST(REPLACE(Revenue, ',', '') AS BIGINT) as Revenue,
    SUM(CAST(REPLACE(Revenue, ',', '') AS BIGINT)) as revenue_sum
FROM table
GROUP BY 1, 2, 3, 4
```

**Result:**
- `"217,351"` → `217351` (BIGINT)
- `"192,615"` → `192615` (BIGINT)
- `revenue_sum` = 409,966 (correct numeric sum)

### Example 2: European Format (Comma as Decimal)

**CSV Data:**
```
Product,Price
Widget,"12,50"
Gadget,"8,99"
```

**Configuration:**
```json
{
  "column_casts": {
    "Price": {
      "cast_type": "DECIMAL(10,2)",
      "replacement_pattern": "," → "."  // Would need custom logic
    }
  }
}
```

**Note**: Current implementation uses simple REPLACE. For more complex transforms, extend CastField with additional parameters.

## Implementation Workflow

### For End Users

1. **Upload CSV** - Columns with quoted numbers detected as VARCHAR
2. **Configure Column Types** - In UI, specify cast configuration
   - Select column: "Revenue"
   - Choose type: "BIGINT" or "DOUBLE"
   - Specify replacement pattern: "," (to remove thousands separator)
3. **Run Query** - Backend automatically applies CAST at query time
4. **Aggregations Work** - SUM, AVG, etc. now work on cast values

### For API Consumers

**POST /api/v1/data/query**:
```json
{
  "target_table": "my_table",
  "dimensions": [
    {
      "field": "Period start time",
      "flavour": "discrete"
    }
  ],
  "measures": [
    {
      "field": "Revenue",
      "aggregation": "sum",
      "alias": "total_revenue"
    }
  ],
  "column_casts": {
    "Revenue": {
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    }
  }
}
```

## Implementation Checklist

- [x] Add `column_casts` to `ConnectionDetails` model
- [x] Add `cast_type` and `cast_replacement` to `Column` model
- [x] Add `column_casts` to `QueryDescription` model
- [x] Create `CastField` pypika Term class
- [x] Add `_get_field_with_cast()` helper method
- [x] Apply casting to dimensions in SELECT clause
- [x] Apply casting to measures (inside aggregation functions)
- [x] Apply casting to filters in WHERE clause
- [x] Apply casting to NULL filters for continuous dimensions
- [ ] Frontend: Add column casting UI in data source configuration
- [ ] Frontend: Store column_casts in connection settings
- [ ] Frontend: Pass column_casts in query requests
- [ ] Backend: Load column_casts from connection details and pass to query builder
- [ ] Testing: Add unit tests for CastField rendering
- [ ] Testing: Add integration tests with sample CSV
- [ ] Documentation: Update API documentation
- [ ] Documentation: Add user guide for CSV configuration

## Testing

### Unit Tests

**Test CastField SQL generation:**
```python
def test_cast_field_with_replacement():
    field = Field('revenue')
    cast_field = CastField(field, 'BIGINT', ',')
    sql = cast_field.get_sql(quote_char='"')
    assert sql == 'CAST(REPLACE(revenue, \',\', \'\') AS BIGINT)'

def test_cast_field_without_replacement():
    field = Field('amount')
    cast_field = CastField(field, 'DOUBLE')
    sql = cast_field.get_sql(quote_char='"')
    assert sql == 'CAST(amount AS DOUBLE)'
```

### Integration Tests

**Test with actual CSV:**
```python
def test_quoted_numbers_with_casting():
    csv_data = 'Revenue\n"217,351"\n"192,615"'
    
    column_casts = {
        'Revenue': {
            'cast_type': 'BIGINT',
            'replacement_pattern': ','
        }
    }
    
    query = QueryDescription(
        target_table='test',
        measures=[Measure(field='Revenue', aggregation='sum', alias='total')],
        column_casts=column_casts
    )
    
    service = QueryService()
    sql, _ = service.translate_to_sql(query, 'test', db_type='duckdb')
    
    # SQL should include: CAST(REPLACE(Revenue, ',', '') AS BIGINT)
    assert 'CAST(REPLACE' in sql
    assert 'BIGINT' in sql
```

## Advantages

✅ **No external tools needed** - Casting happens in SQL queries
✅ **Automatic on all queries** - Once configured, applies to every query
✅ **Works with all operations** - Dimensions, measures, filters
✅ **Database-agnostic** - DuckDB, ClickHouse, PostgreSQL, etc.
✅ **Performance** - Cast happens once in database, no post-processing
✅ **Configuration stored** - Connection stores casting rules persistently
✅ **Flexible patterns** - Supports any REPLACE pattern (commas, symbols, etc.)

## Limitations

⚠️ **Simple pattern matching only** - Current implementation uses REPLACE
  - For complex transforms, extend CastField with additional methods
  - Could add support for REGEX_REPLACE in future

⚠️ **Pattern applies to entire value** - Cannot selectively remove characters
  - For example: "$1,234.56" requires two patterns (remove "$" and ",")
  - Could extend to support multiple patterns per column

⚠️ **Manual configuration required** - User must specify column casts
  - Could implement auto-detection in frontend by analyzing sample rows
  - Could add "suggest" endpoint that scans data for common patterns

## Future Enhancements

1. **Auto-detection**: Scan sample rows, suggest casting for columns with mixed types
2. **Pattern library**: Pre-configured patterns for common formats (USD currency, European numbers, etc.)
3. **Regex support**: Use REGEX_REPLACE for more complex transforms
4. **Type inference**: Analyze data and recommend cast types
5. **Preview**: Show "before" and "after" values during configuration

## Related Documentation

- `QUOTED_NUMBERS_STRATEGY.md` - Original strategy analysis
- `backend/models/data_source.py` - ConnectionDetails and Column models
- `backend/models/query.py` - QueryDescription model
- `backend/services/query_service.py` - Query building and CastField implementation

## FAQ

**Q: Does casting affect CSV parsing?**
A: No. DuckDB still reads CSV as-is (VARCHAR for quoted numbers). Casting happens in the SQL query after data is read.

**Q: Can I cast to any SQL type?**
A: Yes - BIGINT, INTEGER, DOUBLE, DECIMAL, VARCHAR, DATE, TIMESTAMP, etc. Ensure the pattern removes invalid characters for the target type.

**Q: What if the replacement pattern is too aggressive?**
A: Test the pattern first. For example, removing all commas from "$1,234.56,789.00" would give invalid result. For complex formats, need multiple patterns.

**Q: Does it work with expressions?**
A: Currently works with field names and basic replacement. Could extend to support expressions in future.

**Q: Performance impact?**
A: Minimal - CAST and REPLACE are fast SQL operations. Better than parsing all values in Python.

**Q: Can I preview the cast results?**
A: Add a preview endpoint that runs a LIMIT 10 query with casts applied. Frontend can show before/after values.
