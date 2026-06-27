// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, UserChartType } from '../types';
import { getResultColumnName } from './fieldUtils';

/**
 * Retired: the legacy AG Grid table is no longer used.
 *
 * All-discrete data shapes now auto-select the Tableau-style `table-refactor`
 * chart via `detectDefaultUserChartType`. This always returns `false`; parameters
 * are kept so existing call sites compile unchanged.
 */
export function shouldUseTableView(
  _xFields: Field[],
  _yFields: Field[],
  _globalChartType?: UserChartType | null,
): boolean {
  return false;
}

/**
 * Prepares table data for AG Grid from query results based on axis configuration
 */
export function prepareTableData(queryResult: any, xFields: Field[], yFields: Field[]) {
  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return { columns: [], rows: [] };
  }

  const hasXFields = xFields.length > 0;
  const hasYFields = yFields.length > 0;

  if (hasXFields && hasYFields) {
    // Case 3: Both X and Y dimensions - create grid layout
    const result = prepareGridLayout(queryResult, xFields, yFields);
    return applyHierarchicalGrouping(result, yFields);
  } else if (hasYFields) {
    // Case 1: Only Y axis dimensions - vertical column
    const result = prepareVerticalLayout(queryResult, yFields);
    return applyHierarchicalGrouping(result, yFields);
  } else if (hasXFields) {
    // Case 2: Only X axis dimensions - horizontal row
    return prepareHorizontalLayout(queryResult, xFields);
  }

  return { columns: [], rows: [] };
}

/**
 * Prepares vertical layout for Y-axis only dimensions
 */
function prepareVerticalLayout(queryResult: any, yFields: Field[]) {
  // Get unique combinations of Y field values
  const uniqueRows = getUniqueValueCombinations(queryResult.rows, yFields);
  
  // Create columns for each Y dimension
  const columns = yFields.map((field) => {
    const resultColumnName = getResultColumnName(field);
    return {
      field: resultColumnName,
      headerName: resultColumnName,
      width: 120,
      cellStyle: { textAlign: 'left' as const },
    };
  });

  return { columns, rows: uniqueRows };
}

/**
 * Prepares horizontal layout for X-axis only dimensions
 */
function prepareHorizontalLayout(queryResult: any, xFields: Field[]) {
  // Get unique combinations of X field values
  const uniqueXCombinations = getUniqueValueCombinations(queryResult.rows, xFields);
  
  // Create a column for each unique value combination
  const columns = uniqueXCombinations.map((xCombo, index) => ({
    field: `value_${index}`,
    headerName: createCombinationLabel(xCombo, xFields),
    width: 80,
    cellStyle: { textAlign: 'center' as const },
  }));

  // Create a single row with values for each column
  const row: any = {};
  uniqueXCombinations.forEach((_, index) => {
    row[`value_${index}`] = 'Abc';
  });

  return { columns, rows: [row] };
}

/**
 * Prepares grid layout for both X and Y dimensions
 */
function prepareGridLayout(queryResult: any, xFields: Field[], yFields: Field[]) {
  // Get unique Y combinations (rows)
  const uniqueYRows = getUniqueValueCombinations(queryResult.rows, yFields);
  
  // Get unique X combinations (columns)
  const uniqueXCombinations = getUniqueValueCombinations(queryResult.rows, xFields);
  
  // Create column definitions: Y fields + X combinations
  const columns = [
    // Y dimension columns
    ...yFields.map((field) => {
      const resultColumnName = getResultColumnName(field);
      return {
        field: resultColumnName,
        headerName: resultColumnName,
        width: 120,
        pinned: 'left' as const,
        cellStyle: { textAlign: 'left' as const },
      };
    }),
    // X combination columns
    ...uniqueXCombinations.map((xCombo, index) => ({
      field: `x_combo_${index}`,
      headerName: createCombinationLabel(xCombo, xFields),
      width: 80,
      cellStyle: { textAlign: 'left' as const },
    }))
  ];

  // Create rows: each Y combination with cells for X combinations
  const rows = uniqueYRows.map((yCombo, rowIndex) => {
    const row: any = {
      _id: rowIndex,
      // Add Y dimension values
      ...yCombo,
    };

    // Add X combination cells
    uniqueXCombinations.forEach((xCombo, colIndex) => {
      const exists = checkCombinationExists(queryResult.rows, yCombo, xCombo, yFields, xFields);
      row[`x_combo_${colIndex}`] = exists ? 'Abc' : '';
    });

    return row;
  });

  return { columns, rows };
}

/**
 * Gets unique value combinations from rows for given fields
 */
function getUniqueValueCombinations(rows: any[], fields: Field[]) {
  const seen = new Set<string>();
  const unique: any[] = [];

  rows.forEach((row) => {
    const combo: any = {};
    fields.forEach((field) => {
      const resultColumnName = getResultColumnName(field);
      combo[resultColumnName] = row[resultColumnName];
    });

    const key = stableValueKey(combo);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(combo);
    }
  });

  return unique;
}

function stableValueKey(value: any): string {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === 'bigint') {
      return { __type: 'bigint', value: nestedValue.toString() };
    }
    if (nestedValue instanceof Date) {
      return { __type: 'date', value: nestedValue.toISOString() };
    }
    return nestedValue;
  });
}

/**
 * Creates a label for a combination of values
 */
function createCombinationLabel(combination: any, fields: Field[]): string {
  return fields.map((field) => combination[getResultColumnName(field)]).join(' - ');
}

/**
 * Checks if a combination of Y and X values exists in the data
 */
function checkCombinationExists(rows: any[], yCombo: any, xCombo: any, yFields: Field[], xFields: Field[]): boolean {
  return rows.some((row) => {
    // Check if all Y field values match
    const yMatch = yFields.every((field) => {
      const resultColumnName = getResultColumnName(field);
      return row[resultColumnName] === yCombo[resultColumnName];
    });
    // Check if all X field values match
    const xMatch = xFields.every((field) => {
      const resultColumnName = getResultColumnName(field);
      return row[resultColumnName] === xCombo[resultColumnName];
    });
    return yMatch && xMatch;
  });
}

/**
 * Applies hierarchical grouping with row spanning to table data
 * This creates multi-row cells for consecutive duplicate values in leftmost columns
 */
function applyHierarchicalGrouping(tableData: { columns: any[], rows: any[] }, groupFields: Field[]) {
  if (tableData.rows.length <= 1 || groupFields.length === 0) {
    return tableData;
  }

  const { columns, rows } = tableData;
  
  // Sort rows hierarchically to ensure proper grouping
  const sortedRows = hierarchicalSort(rows, groupFields);
  
  // Add row span information for each grouping field (from left to right)
  groupFields.forEach((field, fieldIndex) => {
    const resultColumnName = getResultColumnName(field);
    
    // Find the column index in the columns array
    const columnIndex = columns.findIndex(col => col.field === resultColumnName);
    if (columnIndex === -1) return;
    
    // Calculate row spans for this field
    calculateRowSpans(sortedRows, resultColumnName, groupFields.slice(0, fieldIndex + 1));
  });

  // Update column definitions to support row spanning and hierarchical sorting
  const updatedColumns = columns.map((col) => {
    const isGroupingField = groupFields.some(field => getResultColumnName(field) === col.field);
    
    return {
      ...col,
      // Custom comparator for hierarchical sorting
      comparator: isGroupingField ? createHierarchicalComparator(groupFields, col.field) : 
                 createHierarchicalComparator(groupFields, col.field, col.field),
      ...(isGroupingField && {
        cellRenderer: 'agGroupCellRenderer',
        rowSpan: (params: any) => {
          return params.data[`${col.field}_rowSpan`] || 1;
        },
        cellClassRules: {
          'hierarchical-group-cell': (params: any) => params.data[`${col.field}_rowSpan`] > 1,
          'hierarchical-hidden-cell': (params: any) => params.data[`${col.field}_hidden`] === true
        }
      })
    };
  });

  return { columns: updatedColumns, rows: sortedRows };
}

/**
 * Calculates row spans for consecutive duplicate values in a specific field
 */
function calculateRowSpans(rows: any[], fieldName: string, hierarchyFields: Field[]) {
  let currentSpanStart = 0;
  
  for (let i = 1; i <= rows.length; i++) {
    const isLastRow = i === rows.length;
    const shouldBreakGroup = isLastRow || !areGroupValuesEqual(
      rows[currentSpanStart], 
      rows[i], 
      hierarchyFields
    );
    
    if (shouldBreakGroup) {
      const spanLength = i - currentSpanStart;
      
      if (spanLength > 1) {
        // Set row span for the first row in the group
        rows[currentSpanStart][`${fieldName}_rowSpan`] = spanLength;
        
        // Mark subsequent rows in the group as hidden for this field
        for (let j = currentSpanStart + 1; j < i; j++) {
          rows[j][`${fieldName}_hidden`] = true;
          rows[j][`${fieldName}_rowSpan`] = 1;
        }
      } else {
        // Single row, no spanning needed
        rows[currentSpanStart][`${fieldName}_rowSpan`] = 1;
      }
      
      currentSpanStart = i;
    }
  }
}

/**
 * Checks if two rows have equal values for all specified hierarchy fields
 */
function areGroupValuesEqual(row1: any, row2: any, hierarchyFields: Field[]): boolean {
  return hierarchyFields.every(field => {
    const fieldName = getResultColumnName(field);
    return row1[fieldName] === row2[fieldName];
  });
}

/**
 * Sorts rows hierarchically by grouping fields first, maintaining proper order for row spanning
 */
function hierarchicalSort(rows: any[], groupFields: Field[]): any[] {
  return [...rows].sort((a, b) => {
    // Sort by each hierarchical field in order
    for (const field of groupFields) {
      const fieldName = getResultColumnName(field);
      const aValue = a[fieldName];
      const bValue = b[fieldName];
      
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      // If equal, continue to next field
    }
    return 0;
  });
}

/**
 * Creates a custom comparator for AG Grid that maintains hierarchical sorting
 * When sorting any column, it first sorts by hierarchy fields, then by the target field
 */
function createHierarchicalComparator(groupFields: Field[], targetField: string, sortField?: string) {
  return (valueA: any, valueB: any, nodeA: any, nodeB: any, isDescending: boolean) => {
    const rowA = nodeA.data;
    const rowB = nodeB.data;
    
    // If this is a hierarchical field being sorted, just use normal comparison
    const isHierarchicalFieldSort = groupFields.some(field => 
      getResultColumnName(field) === targetField
    );
    
    if (isHierarchicalFieldSort) {
      // For hierarchical fields, sort by all hierarchy fields up to this one
      const targetFieldIndex = groupFields.findIndex(field => 
        getResultColumnName(field) === targetField
      );
      
      for (let i = 0; i <= targetFieldIndex; i++) {
        const field = groupFields[i];
        const fieldName = getResultColumnName(field);
        const aValue = rowA[fieldName];
        const bValue = rowB[fieldName];
        
        if (aValue !== bValue) {
          const result = aValue < bValue ? -1 : 1;
          return isDescending && i === targetFieldIndex ? -result : result;
        }
      }
      return 0;
    }
    
    // For non-hierarchical fields, first sort by all hierarchy fields
    for (const field of groupFields) {
      const fieldName = getResultColumnName(field);
      const aValue = rowA[fieldName];
      const bValue = rowB[fieldName];
      
      if (aValue !== bValue) {
        return aValue < bValue ? -1 : 1;
      }
    }
    
    // Within the same hierarchical group, sort by the target field
    const actualSortField = sortField || targetField;
    const aValue = rowA[actualSortField];
    const bValue = rowB[actualSortField];
    
    if (aValue === bValue) return 0;
    
    const result = aValue < bValue ? -1 : 1;
    return isDescending ? -result : result;
  };
} 