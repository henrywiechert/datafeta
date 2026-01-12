import { DataType, Table as ArrowTable, Type } from 'apache-arrow';

// Numeric Arrow type ids we consider safe to coerce when values arrive as strings
const NUMERIC_TYPE_IDS = new Set([Type.Int, Type.Float, Type.Decimal]);

function isAggregateField(name?: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.startsWith('sum(') || n.startsWith('avg(') || n.startsWith('count(') || n.startsWith('min(') || n.startsWith('max(');
}

// Remove one or more layers of quotes (including escaped quotes) around a value
function unwrapQuoted(value: string): string {
  let s = value.trim();
  for (let i = 0; i < 3; i++) {
    if (s.startsWith('\\"') && s.endsWith('\\"')) {
      s = s.slice(2, -2).trim();
      continue;
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return s;
}

function isNumericArrowType(type?: DataType): boolean {
  if (!type) return false;
  const typeId = (type as any).typeId;
  return NUMERIC_TYPE_IDS.has(typeId);
}

function coerceNumericString(value: string, type?: DataType, force = false): string | number {
  const numericType = isNumericArrowType(type);
  if (!numericType && !force) {
    return value;
  }

  let trimmed = unwrapQuoted(value);
  if (!trimmed) {
    return value;
  }

  const numValue = Number(trimmed);
  if (!Number.isFinite(numValue)) {
    return value;
  }

  // Preserve integers that would overflow JS safe range
  if (numericType && (type as any).typeId === Type.Int && !Number.isSafeInteger(numValue)) {
    return value;
  }

  return numValue;
}

/**
 * Normalize Arrow values to standard JavaScript types.
 * Handles special Arrow types like DecimalBigNum, BigInt, Date, etc.
 */
export function normalizeArrowValue(value: any, fieldType?: DataType, fieldName?: string): any {
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

  // Handle TypedArray views (Arrow sometimes exposes 64-bit ints as Uint32Array pairs)
  if (ArrayBuffer.isView(value)) {
    // If single element, just return it
    const view = value as any;
    const len = typeof view.length === 'number' ? view.length : 0;
    if (len === 1) {
      const single = view[0];
      if (typeof single === 'bigint') {
        return Number.isSafeInteger(Number(single)) ? Number(single) : single.toString();
      }
      if (typeof single === 'number') {
        return single;
      }
    }

    // If 64-bit represented as two 32-bit limbs [lo, hi]
    if (len >= 2 && typeof view[0] === 'number' && typeof view[1] === 'number') {
      const lo = BigInt(view[0] >>> 0);
      const hi = BigInt(view[1] >>> 0);
      const combined = (hi << BigInt(32)) + lo;
      if (combined <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(combined);
      }
      return combined.toString();
    }
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

  // Some runtimes return numeric columns as strings (e.g., Arrow decimal/int wrappers);
  // if the field is numeric—or clearly an aggregate—coerce parseable strings back to numbers
  // while preserving precision for values outside the JS safe integer range.
  if (typeof value === 'string') {
    return coerceNumericString(value, fieldType, isAggregateField(fieldName));
  }
  
  return value;
}

export function arrowTableToRows(table: ArrowTable): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const fields = table.schema.fields;

  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, any> = {};
    for (const field of fields) {
      const col = field.name;
      row[col] = normalizeArrowValue(table.getChild(col)?.get(i), field.type, col);
    }
    rows.push(row);
  }

  return rows;
}


