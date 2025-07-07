import { Field } from '../types';
import { FieldClassifier } from '../spec-generator/fieldClassifier';

/**
 * Determines if a table view should be used instead of a chart
 * based on the field configuration.
 */
export function shouldUseTableView(xFields: Field[], yFields: Field[]): boolean {
  const classification = FieldClassifier.classifyFields(xFields, yFields);
  const { continuousDimensions, continuousMeasures, discreteMeasures, xDimensions, yDimensions } = classification;
  
  // Table view: only discrete dimensions present, no continuous dimensions or measures
  return (xDimensions.length > 0 || yDimensions.length > 0) && 
         continuousDimensions.length === 0 && 
         continuousMeasures.length === 0 && 
         discreteMeasures.length === 0;
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
    return prepareGridLayout(queryResult, xFields, yFields);
  } else if (hasYFields) {
    // Case 1: Only Y axis dimensions - vertical column
    return prepareVerticalLayout(queryResult, yFields);
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
  const columns = yFields.map((field) => ({
    field: field.columnName,
    headerName: field.columnName,
    width: 150,
  }));

  return { columns, rows: uniqueRows };
}

/**
 * Prepares horizontal layout for X-axis only dimensions
 */
function prepareHorizontalLayout(queryResult: any, xFields: Field[]) {
  // Get unique combinations of X field values
  const uniqueRows = getUniqueValueCombinations(queryResult.rows, xFields);
  
  // Create columns for each X dimension
  const columns = xFields.map((field) => ({
    field: field.columnName,
    headerName: field.columnName,
    width: 150,
  }));

  return { columns, rows: uniqueRows };
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
    ...yFields.map((field) => ({
      field: field.columnName,
      headerName: field.columnName,
      width: 150,
      pinned: 'left' as const,
    })),
    // X combination columns
    ...uniqueXCombinations.map((xCombo, index) => ({
      field: `x_combo_${index}`,
      headerName: createCombinationLabel(xCombo, xFields),
      width: 100,
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
      combo[field.columnName] = row[field.columnName];
    });

    const key = JSON.stringify(combo);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(combo);
    }
  });

  return unique;
}

/**
 * Creates a label for a combination of values
 */
function createCombinationLabel(combination: any, fields: Field[]): string {
  return fields.map((field) => combination[field.columnName]).join(' - ');
}

/**
 * Checks if a combination of Y and X values exists in the data
 */
function checkCombinationExists(rows: any[], yCombo: any, xCombo: any, yFields: Field[], xFields: Field[]): boolean {
  return rows.some((row) => {
    // Check if all Y field values match
    const yMatch = yFields.every((field) => row[field.columnName] === yCombo[field.columnName]);
    // Check if all X field values match
    const xMatch = xFields.every((field) => row[field.columnName] === xCombo[field.columnName]);
    return yMatch && xMatch;
  });
} 