/**
 * Data validation and cleaning utilities for chart data processing
 */

/**
 * Validates and cleans data for chart consumption
 * Removes invalid numeric values and filters out empty rows
 */
export const validateAndCleanData = (result: any) => {
  if (!result.rows || result.rows.length === 0) {
    return result;
  }

  console.log(`🧹 Validating and cleaning ${result.rows.length} rows`);
  
  const cleanedRows = result.rows
    .map((row: any) => {
      const cleanedRow = { ...row };
      
      // Clean each field in the row
      Object.keys(cleanedRow).forEach(key => {
        const value = cleanedRow[key];
        
        // Handle invalid numeric values
        if (typeof value === 'number') {
          if (!isFinite(value) || isNaN(value)) {
            console.warn(`🚨 Invalid value found in field ${key}: ${value}, replacing with null`);
            cleanedRow[key] = null;
          }
        }
        
        // Handle string representations of invalid numbers
        if (typeof value === 'string') {
          // Only convert strings that are ENTIRELY numeric (not datetime strings like "2023-06-08 09:35:00")
          // Use trim to handle whitespace, and check if the whole string converts cleanly
          const trimmed = value.trim();
          const numValue = parseFloat(trimmed);
          
          // Only convert if the string is entirely a number (parseFloat consumes the whole string)
          // Check by converting back to string and comparing
          if (!isNaN(numValue) && numValue.toString() === trimmed) {
            if (!isFinite(numValue)) {
              console.warn(`🚨 Invalid numeric string found in field ${key}: ${value}, replacing with null`);
              cleanedRow[key] = null;
            } else {
              // Convert valid numeric strings to numbers
              cleanedRow[key] = numValue;
            }
          }
          // Non-numeric strings (including datetime strings) are left as-is
        }
      });
      
      return cleanedRow;
    })
    .filter((row: any) => {
      // Filter out rows that are completely null/undefined
      const hasValidData = Object.values(row).some(value => 
        value !== null && value !== undefined && value !== ''
      );
      return hasValidData;
    });

  const filteredCount = result.rows.length - cleanedRows.length;
  if (filteredCount > 0) {
    console.warn(`🧹 Filtered out ${filteredCount} invalid rows`);
  }

  return {
    ...result,
    rows: cleanedRows,
    row_count: cleanedRows.length
  };
};

/**
 * Checks if a dataset is considered large and should trigger performance warnings
 */
export const isLargeDataset = (rowCount: number): boolean => {
  return rowCount > 50000;
};

/**
 * Logs performance warnings for large datasets
 */
export const logPerformanceWarning = (rowCount: number): void => {
  if (isLargeDataset(rowCount)) {
    console.warn(`⚠️ Large dataset detected (${rowCount} rows). Consider using aggregation or filtering.`);
  }
}; 