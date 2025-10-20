# Column Casting - Quick Reference & Implementation Guide

## Overview

A solution to handle quoted numbers and special formats in CSV files **without external tools**. Casting is applied automatically at query time through SQL CAST operations.

## What Changed

### 1. Models (`backend/models/`)

**`data_source.py`** - Added to `ConnectionDetails`:
```python
column_casts: Optional[Dict[str, Dict[str, str]]] = None
# Maps column_name to {cast_type, replacement_pattern}
```

**`query.py`** - Added to `QueryDescription`:
```python
column_casts: Optional[Dict[str, Dict[str, str]]] = None
```

### 2. Query Service (`backend/services/query_service.py`)

**New class: `CastField`**
- Generates SQL: `CAST(REPLACE(field, ',', '') AS BIGINT)` or `CAST(field AS BIGINT)`
- Handles both simple casting and pattern replacement

**New method: `_get_field_with_cast(table, field_name, column_casts)`**
- Wraps field access
- Returns `CastField` if casting configured, regular `Field` otherwise

**Integration points** (4 places in `translate_to_sql`):
1. Dimensions - Line ~305
2. Measures - Line ~360
3. Filters - Line ~390
4. NULL checks - Line ~423

## How to Use

### Step 1: Configure Column Casts in Connection

When storing connection details (from frontend):

```python
connection_details = {
    "type": "csv",
    "column_casts": {
        "Revenue": {
            "cast_type": "BIGINT",
            "replacement_pattern": ","
        },
        "Cell Availability": {
            "cast_type": "DOUBLE",
            "replacement_pattern": ","
        }
    }
}
```

### Step 2: Pass to Query

When building a query:

```python
query_desc = QueryDescription(
    target_table='my_data',
    dimensions=[...],
    measures=[...],
    column_casts={
        "Revenue": {
            "cast_type": "BIGINT",
            "replacement_pattern": ","
        }
    }
)
```

### Step 3: Backend Generates Cast SQL

The query service automatically applies:

```sql
SELECT 
    CAST(REPLACE(Revenue, ',', '') AS BIGINT) as Revenue,
    SUM(CAST(REPLACE(Revenue, ',', '') AS BIGINT)) as total_revenue
FROM table
```

## Configuration Examples

### Example 1: Thousands Separator (Most Common)

**Problem**: `"217,351"` stored as VARCHAR
**Solution**:
```json
{
  "Revenue": {
    "cast_type": "BIGINT",
    "replacement_pattern": ","
  }
}
```

### Example 2: Just Type Conversion

**Problem**: `"100"` stored as VARCHAR but should be numeric
**Solution**:
```json
{
  "Count": {
    "cast_type": "INTEGER"
  }
}
```
No replacement needed - simple cast.

### Example 3: Multiple Columns

**Configuration**:
```json
{
  "column_casts": {
    "Revenue": {
      "cast_type": "DOUBLE",
      "replacement_pattern": ","
    },
    "Units": {
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    },
    "Timestamp": {
      "cast_type": "TIMESTAMP"
    }
  }
}
```

## SQL Type Options

Common cast targets:

| Type | Use Case | Example |
|------|----------|---------|
| `BIGINT` | Large whole numbers | 217351, 1000000 |
| `INTEGER` | Regular whole numbers | 123, 456 |
| `DOUBLE` / `FLOAT` | Decimal numbers | 12.50, 99.99 |
| `DECIMAL(10,2)` | Precise decimals | Financial values |
| `VARCHAR` | Text (default) | Names, descriptions |
| `DATE` | Dates | 2025-08-22 |
| `TIMESTAMP` | Date + time | 2025-08-22 10:30:00 |

## Testing

Run tests:
```bash
cd /Users/henry/projects/data-slicer
python test_column_casting.py
```

Tests cover:
- ✓ CastField SQL generation (with/without replacement)
- ✓ Helper method behavior
- ✓ Query building with casts
- ✓ Realistic scenarios (quoted numbers, etc.)

## Common Issues & Fixes

### Issue 1: Cast fails with type error
**Cause**: Replacement pattern doesn't remove all non-numeric characters
**Fix**: Verify pattern removes exactly what needs removing
```json
{
  "Amount": {
    "cast_type": "DOUBLE",
    "replacement_pattern": ","  // ✓ Removes comma
  }
}
```

### Issue 2: NULL values become invalid after cast
**Cause**: Empty strings or 'NULL' text in data
**Fix**: DuckDB handles this automatically, but test with your data

### Issue 3: Ordering wrong on cast column
**Cause**: Ordering before cast (uncommon but possible)
**Fix**: Ensure ORDER BY uses cast field name

## Frontend Integration Checklist

- [ ] Add "Column Casting" configuration UI in data source settings
- [ ] Allow users to select columns for casting
- [ ] Show dropdown of SQL types to cast to
- [ ] Allow regex/pattern entry for replacement
- [ ] Show preview: "Before: `\"217,351\"` → After: `217351`"
- [ ] Store `column_casts` in connection details
- [ ] Pass `column_casts` when making query requests
- [ ] Handle validation (warn if pattern leaves non-numeric chars for BIGINT)

## Backend Integration Checklist

- [x] Add `column_casts` to models (QueryDescription, ConnectionDetails)
- [x] Create `CastField` class
- [x] Create `_get_field_with_cast()` helper
- [x] Apply casting in dimensions
- [x] Apply casting in measures
- [x] Apply casting in filters
- [x] Apply casting in NULL checks
- [ ] Load `column_casts` from connection details when querying
- [ ] Validate cast types against database support
- [ ] Add logging for casts applied
- [ ] Add tests for integration with actual CSV data

## Performance Notes

✓ **Efficient**: CAST and REPLACE are native SQL operations
✓ **Fast**: No Python post-processing needed
✓ **Scalable**: Works the same at 1MB or 1GB scale

## Limitations & Future Work

**Current**:
- Simple string replacement only (no regex)
- Must specify each column individually
- Pattern applies to entire value

**Could Add**:
1. **Auto-detection**: Scan sample rows, suggest casts
2. **Pattern library**: Pre-configured patterns (USD, EUR, etc.)
3. **Regex support**: Use REGEX_REPLACE for complex patterns
4. **Multi-pattern**: Apply multiple replacements per column
5. **Type inference**: Suggest optimal cast type based on data

## Files Modified

- ✅ `backend/models/data_source.py` - Added column_casts
- ✅ `backend/models/query.py` - Added column_casts
- ✅ `backend/services/query_service.py` - Added CastField, _get_field_with_cast(), applied to query building
- ✅ `test_column_casting.py` - New test suite
- ✅ `devdoc/COLUMN_CASTING_SOLUTION.md` - Detailed documentation

## Migration from Old Approach

If you had the `fix_csv_thousands.py` approach:

**Old**: Pre-process CSV before upload
```bash
python fix_csv_thousands.py input.csv output.csv
# Upload output.csv
```

**New**: Upload raw CSV, configure casting
```
1. Upload CSV (with quoted numbers as-is)
2. In UI: Configure which columns need casting
3. Run queries - automatic CAST applied
4. Done!
```

**Advantages of new approach**:
- No manual pre-processing step
- Can change casting configuration without re-uploading
- Works with all query operations
- Clear audit trail (SQL shows exactly what's being cast)

## Questions?

See `devdoc/COLUMN_CASTING_SOLUTION.md` for detailed architecture and FAQ.
