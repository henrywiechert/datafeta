#!/usr/bin/env python3
"""
Test script for CSV files with quoted numbers containing thousand separators.
"""

import os
import tempfile
from backend.connectors.file_connector import FileConnector
from backend.dependencies import ConnectionStateManager

def create_test_csv_quoted_numbers():
    """Create a test CSV with quoted numbers using comma as thousands separator."""
    content = """Date,Site Name,Total Count,Active Users,Revenue
2024-10-17,Site A,"217,351","12,456","1,234,567.89"
2024-10-18,Site B,"192,615","10,892","987,654.32"
2024-10-19,Site C,"184,024","9,876","876,543.21"
"""
    fd, path = tempfile.mkstemp(suffix='.csv')
    with os.fdopen(fd, 'w') as f:
        f.write(content)
    return path

def test_quoted_numbers():
    """Test parsing CSV with quoted numbers containing thousand separators."""
    print("\n=== Testing Quoted Numbers with Thousands Separator ===")
    csv_path = create_test_csv_quoted_numbers()
    
    try:
        state_manager = ConnectionStateManager()
        connector = FileConnector(state_manager)
        
        # Test with thousands separator set to comma
        connection_details = {
            'file_path': csv_path,
            'csv_delimiter': ',',
            'csv_has_header': True,
            'csv_decimal_separator': '.',
            'csv_thousands_separator': 'comma',  # Key: set to comma
            'csv_date_format': '%Y-%m-%d',
            'csv_timestamp_format': '%Y-%m-%d %H:%M:%S'
        }
        
        connector.connect(connection_details)
        columns = connector.list_columns(table=os.path.splitext(os.path.basename(csv_path))[0])
        
        print(f"✓ Successfully parsed CSV with quoted numbers")
        print(f"  Columns detected:")
        for col in columns:
            print(f"    - {col.name} ({col.data_type})")
        
        # Try to fetch data
        table_name = os.path.splitext(os.path.basename(csv_path))[0]
        query = f'SELECT * FROM "{table_name}"'
        print(f"\n  Executing query: {query}")
        cols, rows = connector.fetch_data(query)
        
        print(f"\n✓ Successfully fetched data")
        print(f"  Rows: {len(rows)}")
        if rows:
            print(f"  Sample row:")
            for i, row in enumerate(rows[0]):
                print(f"    {cols[i]}: {row} (type: {type(row).__name__})")
        
        connector.disconnect()
        
        # Test statistics
        print(f"\n✓ Data types:")
        for col in columns:
            print(f"  {col.name}: {col.data_type}")
        
    except Exception as e:
        print(f"✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if os.path.exists(csv_path):
            os.unlink(csv_path)

if __name__ == '__main__':
    print("Quoted Numbers with Thousands Separator Test")
    print("=" * 60)
    
    try:
        test_quoted_numbers()
        print("\n" + "=" * 60)
        print("✓ Test completed!")
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
