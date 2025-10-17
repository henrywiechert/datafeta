#!/usr/bin/env python3
"""
Test script for CSV configuration options.
Creates sample CSV files with different formats and tests parsing them.
"""

import os
import tempfile
from backend.connectors.file_connector import FileConnector
from backend.dependencies import ConnectionStateManager

def create_test_csv_european():
    """Create a test CSV with European format (semicolon, comma decimal)."""
    content = """Name;Amount;Date
Product A;1.234,56;17.10.2024
Product B;2.345,67;18.10.2024
Product C;3.456,78;19.10.2024
"""
    fd, path = tempfile.mkstemp(suffix='.csv')
    with os.fdopen(fd, 'w') as f:
        f.write(content)
    return path

def create_test_csv_us():
    """Create a test CSV with US format (comma, period decimal)."""
    content = """Name,Amount,Date
Product A,1234.56,10/17/2024
Product B,2345.67,10/18/2024
Product C,3456.78,10/19/2024
"""
    fd, path = tempfile.mkstemp(suffix='.csv')
    with os.fdopen(fd, 'w') as f:
        f.write(content)
    return path

def create_test_csv_swiss():
    """Create a test CSV with Swiss format (semicolon, period decimal, apostrophe thousands)."""
    content = """Name;Amount;Date
Product A;1'234.56;17.10.2024
Product B;2'345.67;18.10.2024
Product C;10'456.78;19.10.2024
"""
    fd, path = tempfile.mkstemp(suffix='.csv')
    with os.fdopen(fd, 'w') as f:
        f.write(content)
    return path

def test_european_format():
    """Test parsing European CSV format."""
    print("\n=== Testing European Format ===")
    csv_path = create_test_csv_european()
    
    try:
        state_manager = ConnectionStateManager()
        connector = FileConnector(state_manager)
        
        connection_details = {
            'file_path': csv_path,
            'csv_delimiter': ';',
            'csv_has_header': True,
            'csv_decimal_separator': ',',
            'csv_thousands_separator': '',
            'csv_date_format': '%d.%m.%Y',
            'csv_timestamp_format': '%d.%m.%Y %H:%M:%S'
        }
        
        connector.connect(connection_details)
        columns = connector.list_columns(table=os.path.splitext(os.path.basename(csv_path))[0])
        
        print(f"✓ Successfully parsed European CSV")
        print(f"  Columns: {[f'{col.name} ({col.data_type})' for col in columns]}")
        
        # Fetch data
        query = f'SELECT * FROM "{os.path.splitext(os.path.basename(csv_path))[0]}"'
        cols, rows = connector.fetch_data(query)
        print(f"  Rows: {len(rows)}")
        if rows:
            print(f"  Sample row: {rows[0]}")
        
        connector.disconnect()
        
    finally:
        if os.path.exists(csv_path):
            os.unlink(csv_path)

def test_us_format():
    """Test parsing US CSV format."""
    print("\n=== Testing US Format ===")
    csv_path = create_test_csv_us()
    
    try:
        state_manager = ConnectionStateManager()
        connector = FileConnector(state_manager)
        
        connection_details = {
            'file_path': csv_path,
            'csv_delimiter': ',',
            'csv_has_header': True,
            'csv_decimal_separator': '.',
            'csv_thousands_separator': '',
            'csv_date_format': '%m/%d/%Y',
            'csv_timestamp_format': '%m/%d/%Y %H:%M:%S'
        }
        
        connector.connect(connection_details)
        columns = connector.list_columns(table=os.path.splitext(os.path.basename(csv_path))[0])
        
        print(f"✓ Successfully parsed US CSV")
        print(f"  Columns: {[f'{col.name} ({col.data_type})' for col in columns]}")
        
        # Fetch data
        query = f'SELECT * FROM "{os.path.splitext(os.path.basename(csv_path))[0]}"'
        cols, rows = connector.fetch_data(query)
        print(f"  Rows: {len(rows)}")
        if rows:
            print(f"  Sample row: {rows[0]}")
        
        connector.disconnect()
        
    finally:
        if os.path.exists(csv_path):
            os.unlink(csv_path)

def test_swiss_format():
    """Test parsing Swiss CSV format."""
    print("\n=== Testing Swiss Format ===")
    csv_path = create_test_csv_swiss()
    
    try:
        state_manager = ConnectionStateManager()
        connector = FileConnector(state_manager)
        
        connection_details = {
            'file_path': csv_path,
            'csv_delimiter': ';',
            'csv_has_header': True,
            'csv_decimal_separator': '.',
            'csv_thousands_separator': 'apostrophe',
            'csv_date_format': '%d.%m.%Y',
            'csv_timestamp_format': '%d.%m.%Y %H:%M:%S'
        }
        
        connector.connect(connection_details)
        columns = connector.list_columns(table=os.path.splitext(os.path.basename(csv_path))[0])
        
        print(f"✓ Successfully parsed Swiss CSV")
        print(f"  Columns: {[f'{col.name} ({col.data_type})' for col in columns]}")
        
        # Fetch data
        query = f'SELECT * FROM "{os.path.splitext(os.path.basename(csv_path))[0]}"'
        cols, rows = connector.fetch_data(query)
        print(f"  Rows: {len(rows)}")
        if rows:
            print(f"  Sample row: {rows[0]}")
        
        connector.disconnect()
        
    finally:
        if os.path.exists(csv_path):
            os.unlink(csv_path)

if __name__ == '__main__':
    print("CSV Configuration Options Test")
    print("=" * 50)
    
    try:
        test_us_format()
        test_european_format()
        test_swiss_format()
        
        print("\n" + "=" * 50)
        print("✓ All tests passed!")
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
