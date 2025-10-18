#!/usr/bin/env python3
"""
Helper script to clean CSV files containing quoted numbers with thousands separators.

Usage:
    python fix_csv_thousands.py input.csv output.csv

Example:
    python fix_csv_thousands.py "5G25R2 - 5G000 - System Program - 5Sites-systempgm - NRBTS.csv" "5G25R2_cleaned.csv"

What it does:
    - Removes thousands separators (commas) from quoted numbers
    - Converts "217,351" to 217351
    - Preserves all other CSV data unchanged
    - Maintains CSV structure and quoting
"""

import csv
import sys
import os
from pathlib import Path


def clean_csv_thousands(input_file: str, output_file: str, separator: str = ',') -> int:
    """
    Remove thousands separators from quoted numbers in CSV file.
    
    Args:
        input_file: Path to input CSV file
        output_file: Path to output CSV file
        separator: Thousands separator character (default: comma)
    
    Returns:
        Number of cells processed
    """
    cells_processed = 0
    numbers_cleaned = 0
    
    try:
        with open(input_file, 'r', encoding='utf-8') as infile:
            reader = csv.reader(infile)
            
            with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
                writer = csv.writer(outfile)
                
                for row in reader:
                    cleaned_row = []
                    
                    for cell in row:
                        cells_processed += 1
                        
                        # Check if cell is a quoted number with thousands separator
                        # Pattern: starts and ends with quote, contains separator
                        if (cell.startswith('"') and 
                            cell.endswith('"') and 
                            separator in cell):
                            
                            # Remove quotes and separator
                            clean_value = cell.strip('"').replace(separator, '')
                            cleaned_row.append(clean_value)
                            numbers_cleaned += 1
                            
                            print(f"✓ Cleaned: {cell} → {clean_value}")
                        else:
                            # Keep cell as-is
                            cleaned_row.append(cell)
                    
                    writer.writerow(cleaned_row)
        
        return numbers_cleaned
        
    except FileNotFoundError:
        print(f"✗ Error: Input file not found: {input_file}")
        return -1
    except Exception as e:
        print(f"✗ Error processing CSV: {e}")
        return -1


def main():
    if len(sys.argv) < 3:
        print("Usage: python fix_csv_thousands.py <input.csv> <output.csv>")
        print()
        print("Example:")
        print('  python fix_csv_thousands.py "input.csv" "output.csv"')
        print()
        print("This script removes thousands separators (commas) from quoted")
        print("numbers in CSV files, converting '217,351' to 217351")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    # Verify input file exists
    if not os.path.exists(input_file):
        print(f"✗ Error: Input file not found: {input_file}")
        sys.exit(1)
    
    # Warn if output file exists
    if os.path.exists(output_file):
        response = input(f"Output file exists: {output_file}\nOverwrite? (y/n): ")
        if response.lower() != 'y':
            print("Cancelled.")
            sys.exit(0)
    
    print(f"Processing: {input_file}")
    print(f"Output: {output_file}")
    print()
    
    result = clean_csv_thousands(input_file, output_file)
    
    if result >= 0:
        print()
        print(f"✓ Success!")
        print(f"  Cells processed: {result}")
        print(f"  Output file: {output_file}")
        print()
        print("Next steps:")
        print("  1. Upload the cleaned CSV to data-slicer")
        print("  2. Numeric columns should now be detected correctly")
        print("  3. Aggregations (SUM, AVG, etc.) will work on these columns")
    else:
        print("✗ Failed to process file")
        sys.exit(1)


if __name__ == '__main__':
    main()
