#!/bin/bash

# Script to import native ClickHouse tables from .native.gz files
# Usage: ./import-clickhouse-tables.sh <path_to_db_directory>

set -e

# Configuration
CLICKHOUSE_CLIENT="${CLICKHOUSE_CLIENT:-/Users/henry/work/clickhouse/clickhouse}"

# Check if path is provided
if [ -z "$1" ]; then
    echo "Error: Path to database directory is required"
    echo "Usage: $0 <path_to_db_directory>"
    exit 1
fi

DB_DIR="$1"

# Get the database name from the directory name
DB_NAME=$(basename "$DB_DIR")

# Check if directory exists
if [ ! -d "$DB_DIR" ]; then
    echo "Error: Directory $DB_DIR does not exist"
    exit 1
fi

# Check if ClickHouse client is available
if [ ! -x "$CLICKHOUSE_CLIENT" ]; then
    echo "Error: ClickHouse client '$CLICKHOUSE_CLIENT' not found or not executable"
    echo "Set CLICKHOUSE_CLIENT environment variable to specify the client path"
    exit 1
fi

echo "Starting import for database: $DB_NAME"
echo "Source directory: $DB_DIR"
echo "ClickHouse client: $CLICKHOUSE_CLIENT"
echo ""

# Create database if it doesn't exist
echo "Creating database if not exists..."
"$CLICKHOUSE_CLIENT" client --query "CREATE DATABASE IF NOT EXISTS ${DB_NAME}"

# Find all .native.gz files in the database directory
NATIVE_FILES=$(find "$DB_DIR" -name "*.native.gz" -type f)

if [ -z "$NATIVE_FILES" ]; then
    echo "Warning: No .native.gz files found in $DB_DIR"
    exit 0
fi

# Count total files
TOTAL_FILES=$(echo "$NATIVE_FILES" | wc -l | tr -d ' ')
CURRENT_FILE=0

echo "Found $TOTAL_FILES table(s) to import"
echo ""

# Import each table
while IFS= read -r native_file; do
    CURRENT_FILE=$((CURRENT_FILE + 1))
    
    # Extract table name from filename (remove .native.gz extension)
    FILENAME=$(basename "$native_file")
    TABLE_NAME="${FILENAME%.native.gz}"
    
    echo "[$CURRENT_FILE/$TOTAL_FILES] Importing table: $TABLE_NAME"
    
    # Check if table already exists
    TABLE_EXISTS=$("$CLICKHOUSE_CLIENT" client --database="${DB_NAME}" --query "EXISTS TABLE ${TABLE_NAME}" 2>/dev/null)
    if [ "$TABLE_EXISTS" = "1" ]; then
        echo "  Table already exists, skipping..."
        continue
    fi
    
    # Check if there's a corresponding .sql file with table definition
    SQL_FILE="${native_file%.native.gz}.sql"
    if [ -f "$SQL_FILE" ]; then
        echo "  Creating table structure from $TABLE_NAME.sql"
        # Replace literal \n with actual newlines, \' with quotes, and remove database prefix
        sed "s/\\\\n/\n/g; s/\\\\'/'/g; s/CREATE TABLE \`[^']*\`\.\`/CREATE TABLE \`/g" "$SQL_FILE" | "$CLICKHOUSE_CLIENT" client --database="${DB_NAME}" --multiquery
    else
        echo "  Error: No .sql file found for $TABLE_NAME"
        echo "  Skipping..."
        continue
    fi
    
    # Import the native data
    echo "  Importing data..."
    gunzip -c "$native_file" | "$CLICKHOUSE_CLIENT" client --database="${DB_NAME}" --input_format_skip_unknown_fields=1 --query "INSERT INTO ${TABLE_NAME} FORMAT Native"
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Successfully imported $TABLE_NAME"
    else
        echo "  ✗ Failed to import $TABLE_NAME"
        exit 1
    fi
    echo ""
done <<< "$NATIVE_FILES"

# Create views if views.sql exists
VIEWS_SQL="$DB_DIR/views.sql"
if [ -f "$VIEWS_SQL" ]; then
    echo ""
    echo "Creating views from views.sql..."
    
    # First, process escape sequences and remove database prefixes, save to temp file
    TEMP_VIEWS=$(mktemp)
    # Process in stages to avoid issues
    sed 's/\\n/\n/g' "$VIEWS_SQL" | \
    sed "s/\\\\'/'/g" | \
    sed "s/CREATE VIEW \`[^']*\`\.\`/CREATE VIEW \`/g" | \
    sed "s/FROM \`[^']*\`\.\`/FROM \`/g" | \
    sed "s/JOIN \`[^']*\`\.\`/JOIN \`/g" | \
    grep -v "CREATE VIEW \`all_tti_tables_view\`" > "$TEMP_VIEWS"

    echo "==============================="
    echo $TEMP_VIEWS
    echo "==============================="
    cp $TEMP_VIEWS v.log
    
    # 3. Finally create all remaining views
    echo "  Creating remaining views..."
    # Execute all views at once, show errors but don't stop
    if "$CLICKHOUSE_CLIENT" client --database="${DB_NAME}" --multiquery < "$TEMP_VIEWS" 2>&1 | tee /tmp/view_errors.log | grep -i "error\|exception" | head -20; then
        echo "    Some views failed to create (see errors above)"
        echo "    Continuing anyway..."
    fi
    echo "    Done creating views"
    
    # Clean up temp file
    rm -f "$TEMP_VIEWS"
    
    echo "✓ View creation completed"
fi

echo ""
echo "Import completed for database: $DB_NAME"
