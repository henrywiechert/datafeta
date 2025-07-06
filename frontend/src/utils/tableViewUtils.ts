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
 * Prepares table data for Material-UI Table from query results
 */
export function prepareTableData(queryResult: any, xFields: Field[], yFields: Field[]) {
  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return { columns: [], rows: [] };
  }

  const allFields = [...xFields, ...yFields];
  
  // Create columns definition for Table
  const columns = allFields.map((field) => ({
    field: field.columnName,
    headerName: field.columnName,
    width: 150,
  }));

  // Use the rows directly - they should already be in the correct format
  const rows = queryResult.rows.map((row: any, index: number) => ({
    id: index, // Table requires an id field
    ...row
  }));

  return { columns, rows };
} 