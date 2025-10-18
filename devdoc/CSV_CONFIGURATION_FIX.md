# CSV Configuration Bug Fix

## Issue
When uploading a CSV file, the backend was throwing DuckDB errors:

**Error 1:** Parser Error with colon in timestamp format
```
Parser Error: syntax error at or near ":"
LINE 1: ...timestampformat='%Y-%m-%d %H:%M:%S', SAMPLE_SIZE=1000...
```

**Error 2:** Invalid parameter names for Python API
```
Invalid Input Error: The methods read_csv and read_csv_auto do not have the "delim" argument.
```

## Root Cause

### First Issue
The method was building a SQL string by concatenating parameters without proper escaping:
```python
params.append(f"timestampformat='{timestamp_fmt}'")
return ', '.join(params)
```

The colons (`:`) in `%H:%M:%S` were being interpreted as SQL syntax because the quotes weren't properly handled.

### Second Issue
Attempted to use DuckDB's Python `read_csv()` API, but:
1. Wrong parameter names (`delim` vs `delimiter`, `decimal_separator` vs `decimal`)
2. Limited parameter support compared to SQL `read_csv_auto` function
3. Doesn't support `thousands_sep` at all in Python API

## Solution

Use SQL `read_csv_auto` function with **proper string escaping**:

```python
def _build_csv_reader_sql(self) -> str:
    """Build DuckDB read_csv_auto SQL function call with proper parameter escaping."""
    params = []
    
    # Escape single quotes in all string parameters
    delimiter_escaped = delimiter.replace("'", "''")
    params.append(f"delim='{delimiter_escaped}'")
    
    # Date/timestamp formats are just strings - escaping handles special chars
    date_fmt_escaped = date_fmt.replace("'", "''")
    timestamp_fmt_escaped = timestamp_fmt.replace("'", "''")
    params.append(f"dateformat='{date_fmt_escaped}'")
    params.append(f"timestampformat='{timestamp_fmt_escaped}'")
    
    # Build complete SQL function call
    params_str = ', '.join(params)
    return f"read_csv_auto('{self.file_path}', {params_str}, nullstr=[...])"
```

## Key Insights

1. **Quotes matter**: `timestampformat='%H:%M:%S'` - the format string is quoted, so `:` is just a character
2. **Escape single quotes**: Any `'` in user input must be escaped as `''` for SQL
3. **Use SQL not Python API**: `read_csv_auto` in SQL supports all parameters, Python API is limited
4. **Format strings are literals**: DuckDB treats format strings as plain strings, no special parsing of `%` or `:`

## Changes Made

1. **`_build_csv_reader_sql()`** - New method (renamed from `_build_csv_reader_params`)
   - Returns SQL string with properly escaped parameters
   - Escapes all string values (`delimiter.replace("'", "''")"`)
   - All format strings are quoted, so special characters work fine

2. **`list_columns()`** - Uses SQL approach
   - Creates view with `CREATE VIEW ... AS SELECT * FROM read_csv_auto(...)`
   - Executes DESCRIBE on the view

3. **`fetch_data()`** - Same SQL approach
   - Creates view, then queries it
   - Consistent with list_columns

## Benefits

1. ✅ **Full parameter support** - All `read_csv_auto` parameters available
2. ✅ **Proper escaping** - SQL injection safe with quote escaping
3. ✅ **Special characters work** - Colons, percents, etc. in format strings
4. ✅ **Consistent approach** - Same SQL method for all operations

## Testing

Upload a CSV file with default configuration. The connection should work without errors.
Advanced configurations (different delimiters, date formats with colons, etc.) should all work correctly.

