import { Table as ArrowTable } from 'apache-arrow';

/**
 * Normalize Arrow values to standard JavaScript types.
 * Handles special Arrow types like DecimalBigNum, BigInt, Date, etc.
 */
export function normalizeArrowValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  // Handle native BigInt
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  
  // Primitive types pass through
  if (typeof value !== 'object') {
    return value;
  }
  
  // Date objects pass through
  if (value instanceof Date) {
    return value;
  }
  
  // Handle Arrow's numeric wrapper objects (DecimalBigNum, Int64, Uint64, etc.)
  // These are objects with numeric valueOf() methods
  const ctorName = value.constructor?.name || '';
  
  // Known numeric wrapper types from Arrow/DuckDB
  const isNumericWrapper = 
    ctorName === 'DecimalBigNum' ||
    ctorName.includes('Int') ||
    ctorName.includes('Decimal') ||
    ctorName.includes('Float');
    
  if (isNumericWrapper) {
    // Try valueOf() first (some wrappers implement this)
    if (typeof value.valueOf === 'function') {
      const primitive = value.valueOf();
      if (typeof primitive === 'bigint') {
        return Number.isSafeInteger(Number(primitive)) ? Number(primitive) : primitive.toString();
      }
      if (typeof primitive === 'number') {
        return primitive;
      }
    }
    
    // Try Number() conversion
    const numValue = Number(value);
    if (!isNaN(numValue) && Number.isFinite(numValue)) {
      return numValue;
    }
    
    // Fall back to string representation
    return String(value);
  }
  
  return value;
}

export function arrowTableToRows(table: ArrowTable): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const columns = table.schema.fields.map((f) => f.name);

  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, any> = {};
    for (const col of columns) {
      row[col] = normalizeArrowValue(table.getChild(col)?.get(i));
    }
    rows.push(row);
  }

  return rows;
}


