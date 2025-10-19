# Save/Load Configuration Feature

## Overview

The Data Slicer application now supports saving and loading complete workspace configurations, allowing you to preserve and restore your work.

## Features

### What Gets Saved

When you save a configuration, the following information is stored in a JSON file:

1. **All Sheets**: Every sheet with its visualization settings
   - Field assignments (X-axis, Y-axis, filters, color, size)
   - Filter configurations and applied filters
   - Color schemes and size ranges
   - Sheet names and metadata

2. **Data Source Selection**: 
   - Selected database name
   - Selected table name

3. **Connection Metadata** (without passwords):
   - Connection type (CSV or ClickHouse)
   - For ClickHouse: host, port, username, database name
   - For CSV: delimiter, header settings, separators, date formats
   - Column casting configurations

### What Does NOT Get Saved

For security reasons, **passwords are never saved** in configuration files. When loading a configuration with connection details, you will be prompted to re-enter the password.

## How to Use

### Saving a Configuration

1. Click the menu icon (⋮) in the top-right corner of the application
2. Select "Save Configuration"
3. A JSON file will be downloaded to your computer with the format: `data-slicer-config-YYYY-MM-DD.json`

### Loading a Configuration

1. Click the menu icon (⋮) in the top-right corner
2. Select "Load Configuration"
3. Choose a previously saved JSON configuration file
4. If the configuration includes connection details:
   - A dialog will appear showing the connection information
   - **For ClickHouse**: Enter the password for the connection
   - **For CSV**: Select the CSV file to load
   - Click "Connect" to establish the connection
   - Or click "Skip Connection" to load only the sheets without reconnecting
5. Your sheets and settings will be restored

## Connection Restore Dialog

When loading a configuration that includes connection metadata, you'll see the **Connection Restore Dialog** with the following options:

- **Cancel**: Abort the configuration load entirely
- **Skip Connection**: Load the sheets and settings without connecting to the data source (useful if you want to view the configuration structure)
- **Connect**: Establish the connection with the provided credentials and fully restore the workspace

### ClickHouse Connection Restore

The dialog will display:
- Host address
- Port number
- Username
- Database name

You must provide the password to reconnect.

### CSV Connection Restore

The dialog will display:
- CSV configuration settings (delimiter, header, separators, etc.)

You must select a CSV file to upload.

## Configuration File Format

The JSON configuration file follows this structure:

```json
{
  "version": "1.0.0",
  "exportedAt": "2025-10-19T12:34:56.789Z",
  "appName": "data-slicer",
  "connection": {
    "type": "clickhouse",
    "host": "localhost",
    "port": 8123,
    "user": "default",
    "database": "my_database"
  },
  "dataSource": {
    "selectedDatabase": "my_database",
    "selectedTable": "sales_data"
  },
  "sheets": [
    {
      "id": "sheet-1",
      "name": "Sheet 1",
      "visualizationState": {
        "xAxisFields": [...],
        "yAxisFields": [...],
        "filterFields": [...],
        "colorField": {...},
        "sizeField": {...},
        ...
      },
      "createdAt": 1234567890,
      "lastModified": 1234567890
    }
  ],
  "activeSheetId": "sheet-1",
  "nextSheetNumber": 2
}
```

## Use Cases

### Sharing Configurations

You can share saved configuration files with colleagues. They will need:
- Access to the same data source
- The password/credentials for the connection
- The CSV file (if using CSV data source)

### Backup and Version Control

Save configurations periodically to:
- Backup your work
- Track different analysis approaches
- Create snapshots of important findings

### Switching Between Projects

Quickly switch between different analysis projects by loading different configuration files.

## Future Enhancements

### Planned Features

1. **Data Snapshots**: Option to save the actual data with the configuration, allowing viewing without access to the data source
2. **Shareable URLs**: Generate links that encode the configuration for easy sharing
3. **Auto-save**: Automatic periodic saving of configurations
4. **Configuration Library**: Manage multiple saved configurations within the app

## Technical Details

- Configuration files are standard JSON format
- Version number allows for future compatibility checks
- Passwords and sensitive data are explicitly excluded for security
- File size depends on the number of sheets and complexity of configurations (typically < 100KB)

## Troubleshooting

### "Invalid configuration" Error

- Ensure the file is a valid JSON file
- Check that it was exported from Data Slicer (appName must be "data-slicer")
- Verify the version is compatible (currently 1.x.x)

### Connection Failed After Loading

- Verify the connection details are correct
- Ensure the data source is accessible
- Check that the database and table still exist
- For CSV, ensure you selected the correct file

### Sheets Load But No Data

- You may have clicked "Skip Connection"
- Load the configuration again and choose "Connect" instead
- Or manually connect to the data source from the Data Sources tab

