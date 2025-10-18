# Handling CSV Columns with Quoted Numbers and Thousands Separators

## Problem Statement

Some CSV files contain numeric columns where the values are quoted strings with thousands separators, like:
```csv
Site Name,Total Count,Active Users
Site A,"217,351","12,456"
Site B,"192,615","10,892"
```

These need to be recognized and parsed as numbers, not as text strings.

## Solution Strategy

### 1. **Current Limitation: DuckDB doesn't support thousands separators**

**Important Discovery**: DuckDB's `read_csv_auto()` function does NOT have a `thousands` parameter. Values like `"217,351"` will be detected as **strings, not numbers**.

This is a DuckDB limitation - the function only supports:
- `delim` - field delimiter
- `decimal_separator` - decimal point character  
- `dateformat` and `timestampformat` - date/time patterns
- But NOT thousands separators

#### Current Behavior:
- Input: `"217,351"` (quoted with comma)
- DuckDB detects: `VARCHAR` (text string)
- Result: `"217,351"` (stored as string, can't be summed)
- ❌ Numeric operations will fail

### 2. **Solution A: Pre-Process CSV (Recommended)**

**Pre-process the CSV file to remove thousands separators before uploading.**

#### Using Python:
```python
import csv
import re

def remove_thousands_separators(input_file, output_file, separator=','):
    """Remove thousands separators from quoted numbers in CSV."""
    with open(input_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
        reader = csv.reader(infile)
        writer = csv.writer(outfile)
        
        for row in reader:
            processed_row = []
            for cell in row:
                # If cell is quoted number with thousands separator
                if cell.startswith('"') and cell.endswith('"'):
                    # Remove quotes and thousands separator
                    clean = cell.strip('"').replace(separator, '')
                    processed_row.append(clean)
                else:
                    processed_row.append(cell)
            writer.writerow(processed_row)
```

#### Using Excel/Sheets:
1. Open CSV in Excel
2. Use Find & Replace: Find `","` replace with `` (empty)
3. Save as CSV
4. Upload to data-slicer

#### Result:
- `"217,351"` → `217351`
- DuckDB detects as `BIGINT` automatically
- Numeric operations work ✓

---

### 2. **Solution B: Post-Query CAST (Alternative)**

**Keep the CSV as-is, convert at query time using CAST.**

#### How it works:
1. Upload CSV normally (don't worry about thousands separators)
2. DuckDB detects `"217,351"` columns as `VARCHAR`
3. In queries, use `CAST` to convert:

```sql
SELECT 
    "Site Name",
    CAST(REPLACE("Total Count", ',', '') AS BIGINT) as total_count_numeric,
    CAST(REPLACE("Active Users", ',', '') AS BIGINT) as active_users_numeric
FROM my_table
```

#### Implementation (Backend):
Would need to:
- Detect which columns are "numeric strings"
- Automatically inject `REPLACE(..., ',', '')` and `CAST(... AS BIGINT)`
- Requires frontend UI to mark columns as numeric

#### Pros:
- ✓ No pre-processing needed
- ✓ Works on existing CSV files

#### Cons:
- ✗ Query overhead: extra REPLACE/CAST per query
- ✗ Requires column type detection UI
- ✗ Can't use these columns in simple queries like `SELECT *`

---

### 3. **Solution C: Manual Column Type Override (Future Feature)**

**Add frontend UI to manually specify column types.**

Frontend feature:
```typescript
interface ColumnOverride {
  name: string;
  detected_type: string;      // e.g., "VARCHAR"
  override_type: string;      // e.g., "BIGINT"
  conversion_rule?: string;   // e.g., "REPLACE(',', '')"
}
```

Backend applies at query generation:
```python
# For each column with override_type != detected_type:
if column.override_type == "BIGINT" and column.detected_type == "VARCHAR":
    field = f"CAST(REPLACE({field_name}, ',', '') AS BIGINT)"
```

---

## Implementation Checklist

### Current State
- [x] CSV configuration UI (delimiter, decimal, thousands separator inputs exist)
- [x] CSV handling in backend (file_connector.py)
- [ ] Thousands separator parameter - **Removed** (not supported by DuckDB)
- [ ] Post-query CAST feature - **Not implemented**
- [ ] Column type override UI - **Not implemented**

### Recommended Next Steps

**Option 1: User Pre-Processing (Low effort, works now)**
- [ ] Add note to UI: "If CSV has quoted numbers with thousands separators, use Find & Replace to remove them before uploading"
- [ ] Provide Python script for pre-processing

**Option 2: Backend Auto-CAST (Medium effort)**
- [ ] Detect VARCHAR columns containing pattern like `"XXX,XXX"`
- [ ] Auto-inject REPLACE/CAST in query generation
- [ ] Works transparently for users

**Option 3: Manual Column Override UI (Higher effort)**
- [ ] Add UI to show detected types
- [ ] Allow users to override type for specific columns
- [ ] Backend applies conversion at query time

## Testing Your CSV

### Current Behavior (DuckDB Limitation)
With your CSV containing `"217,351"`:
1. Upload the file
2. Check column detection: Column will be detected as `VARCHAR` (text)
3. Try to sum the column: Will likely fail or return 0

### Workaround: Pre-Process the CSV

**Python script to fix this:**
```python
import csv

def fix_quoted_numbers(input_file, output_file):
    with open(input_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
        reader = csv.reader(infile)
        writer = csv.writer(outfile)
        
        for row in reader:
            fixed_row = []
            for cell in row:
                # Remove thousands separators from quoted numbers
                if cell.startswith('"') and cell.endswith('"'):
                    clean = cell.strip('"').replace(',', '')
                    fixed_row.append(clean)
                else:
                    fixed_row.append(cell)
            writer.writerow(fixed_row)

fix_quoted_numbers('5G25R2 - 5G000 - System Program - 5Sites-systempgm - NRBTS.csv', 
                   '5G25R2_cleaned.csv')
```

**Then:**
1. Upload the cleaned CSV
2. Set CSV options as before
3. Columns with numbers should now be detected as `BIGINT` or `DECIMAL`
4. Numeric operations will work ✓

## DuckDB Parameter Reference

When calling `read_csv_auto()`:

```python
# Thousands separator options:
thousands=','         # Comma (1,234,567)
thousands=' '         # Space (1 234 567)  
thousands="'"         # Apostrophe (1'234'567)
thousands=''          # None (1234567) - default

# Decimal separator options:
decimal_separator='.'  # Period (1234.56) - default
decimal_separator=','  # Comma (1234,56)
```

## Related Issues

- CSV Column names with spaces: ✓ Fixed with quoted identifiers
- DateTime format flexibility: ✓ Configurable format strings
- Thousands separators with quoted numbers: ⚠️ Requires pre-processing (DuckDB limitation)
