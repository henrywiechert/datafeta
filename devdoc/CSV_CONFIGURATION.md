# CSV Configuration Options

This document describes the CSV file configuration options available in the data-slicer application.

## Overview

When connecting to a CSV data source, you can now configure various parsing options to handle different CSV formats and regional conventions. These options are accessible through the "Advanced CSV Options" section in the Data Source Selection page.

## Configuration Options

### 1. Delimiter
**Default:** Comma (`,`)

The character that separates values in each row of the CSV file.

**Options:**
- **Comma (`,`)** - Standard CSV format (e.g., `value1,value2,value3`)
- **Semicolon (`;`)** - Common in European countries (e.g., `value1;value2;value3`)
- **Tab** - Tab-separated values (TSV format)
- **Pipe (`|`)** - Alternative delimiter (e.g., `value1|value2|value3`)

### 2. Header Row
**Default:** Yes (first line)

Specifies whether the first line of the CSV file contains column headers.

**Options:**
- **Yes (first line)** - First row contains column names
- **No** - No header row; columns will be auto-named (column0, column1, etc.)

### 3. Decimal Separator
**Default:** Period (`.`)

The character used to separate the integer and fractional parts of decimal numbers.

**Options:**
- **Period (`.`)** - Used in US, UK, and many other countries (e.g., `1234.56`)
- **Comma (`,`)** - Used in many European countries (e.g., `1234,56`)

**Important:** The decimal separator affects how numbers are parsed. Choose the format that matches your CSV file.

### 4. Thousands Separator
**Default:** None

The character used to group digits in large numbers for readability.

**Options:**
- **None** - No separator (e.g., `1234567`)
- **Comma (`,`)** - Used in US, UK (e.g., `1,234,567`)
- **Space** - Common in some European countries (e.g., `1 234 567`)
- **Apostrophe (`'`)** - Used in Switzerland and some other countries (e.g., `1'234'567`)

**Note:** The thousands separator must be different from the decimal separator.

### 5. Date Format
**Default:** `YYYY-MM-DD` (ISO 8601 format)

The format pattern for date values in the CSV file.

**Common Formats:**
- **YYYY-MM-DD** - ISO format: `2024-10-17`
- **DD.MM.YYYY** - European format: `17.10.2024`
- **MM/DD/YYYY** - US format: `10/17/2024`
- **DD/MM/YYYY** - International format: `17/10/2024`

**Format Codes:**
- `%Y` - 4-digit year (e.g., 2024)
- `%m` - 2-digit month (01-12)
- `%d` - 2-digit day (01-31)

### 6. Timestamp Format
**Default:** `YYYY-MM-DD HH:MM:SS`

The format pattern for datetime/timestamp values in the CSV file.

**Common Formats:**
- **YYYY-MM-DD HH:MM:SS** - ISO format with seconds: `2024-10-17 14:30:45`
- **DD.MM.YYYY HH:MM:SS** - European format: `17.10.2024 14:30:45`
- **MM/DD/YYYY HH:MM:SS** - US format: `10/17/2024 14:30:45`
- **DD/MM/YYYY HH:MM:SS** - International format: `17/10/2024 14:30:45`
- **YYYY-MM-DD HH:MM** - Without seconds: `2024-10-17 14:30`

**Format Codes:**
- `%Y` - 4-digit year
- `%m` - 2-digit month (01-12)
- `%d` - 2-digit day (01-31)
- `%H` - 2-digit hour (00-23)
- `%M` - 2-digit minute (00-59)
- `%S` - 2-digit second (00-59)

## Regional Presets

### United States / United Kingdom
- Delimiter: Comma (`,`)
- Decimal separator: Period (`.`)
- Thousands separator: Comma (`,`)
- Date format: MM/DD/YYYY
- Timestamp format: MM/DD/YYYY HH:MM:SS

### Continental Europe (e.g., Germany, France, Italy)
- Delimiter: Semicolon (`;`)
- Decimal separator: Comma (`,`)
- Thousands separator: Space or Period (`.`)
- Date format: DD.MM.YYYY
- Timestamp format: DD.MM.YYYY HH:MM:SS

### Switzerland
- Delimiter: Semicolon (`;`)
- Decimal separator: Period (`.`)
- Thousands separator: Apostrophe (`'`)
- Date format: DD.MM.YYYY
- Timestamp format: DD.MM.YYYY HH:MM:SS

### International (ISO Standard)
- Delimiter: Comma (`,`)
- Decimal separator: Period (`.`)
- Thousands separator: None
- Date format: YYYY-MM-DD (ISO 8601)
- Timestamp format: YYYY-MM-DD HH:MM:SS

## Implementation Details

### Backend
The CSV configuration is implemented in:
- `backend/models/data_source.py` - `ConnectionDetails` model with CSV configuration fields
- `backend/connectors/file_connector.py` - DuckDB CSV reader configuration
- `backend/services/connection_service.py` - Passing configuration from request to connector

The backend uses DuckDB's `read_csv_auto()` function with configurable parameters to parse CSV files according to the specified format.

### Frontend
The CSV configuration UI is implemented in:
- `frontend/src/types.ts` - `ConnectionDetails` interface with CSV options
- `frontend/src/pages/DataSourceSelectionPage.tsx` - UI controls and state management

The configuration options are collapsed by default under "Advanced CSV Options" to keep the UI clean for users who don't need custom settings.

## Best Practices

1. **Start with defaults**: Try connecting with default settings first, as they work for most CSV files.

2. **Check your data**: Open the CSV file in a text editor to verify:
   - What delimiter is used
   - Whether there's a header row
   - How numbers and dates are formatted

3. **Match the format exactly**: Ensure your configuration matches the actual format in the CSV file, especially for:
   - Decimal vs. thousands separators
   - Date/timestamp patterns

4. **Test with a sample**: If you're unsure about the format, test with a small sample CSV file first.

5. **Consistent formatting**: Make sure your CSV file uses consistent formatting throughout (same delimiter, same date format, etc.).

## Troubleshooting

### Numbers parsed as text
- Check that decimal separator setting matches your CSV file
- Ensure thousands separator (if any) is configured correctly
- Verify there are no unexpected characters in numeric fields

### Dates not recognized
- Verify the date format pattern matches your CSV exactly
- Check that dates are consistently formatted in the file
- Ensure there are no extra spaces or unusual characters

### Wrong column names or data
- Check if "Header Row" setting is correct
- Verify the delimiter setting matches your file

### Special characters in data
- Ensure the CSV file is properly encoded (UTF-8 recommended)
- Check for quote characters around values with delimiters
