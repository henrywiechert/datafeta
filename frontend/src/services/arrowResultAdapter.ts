// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { DataType, Table as ArrowTable, Type } from 'apache-arrow';
import { devLog } from '../utils/devLog';

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

  // Some runtimes return numeric columns as strings (e.g., Arrow decimal/int wrappers);
  // if the field is numeric—or clearly an aggregate—coerce parseable strings back to numbers
  // while preserving precision for values outside the JS safe integer range.
  if (typeof value === 'string') {
    return coerceNumericString(value, fieldType, isAggregateField(fieldName));
  }
  
  // Handle native BigInt
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  
  // Primitive types pass through, but sanitize non-finite floats to null
  if (typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return null;
    }
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
        return Number.isFinite(primitive) ? primitive : null;
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

/**
 * Try to extract the raw 64-bit epoch value from a Timestamp Arrow vector
 * for a single row, preserving sub-millisecond precision that vector.get()
 * discards.  Returns undefined when extraction isn't possible (caller should
 * fall back to vector.get()).
 */
function tryGetRawTimestamp(vector: any, rowIndex: number): number | null | undefined {
  try {
    const chunks: any[] = vector.data;
    if (!Array.isArray(chunks)) return undefined;

    let offset = 0;
    for (const chunk of chunks) {
      const len: number = chunk.length;
      if (rowIndex < offset + len) {
        const localIdx = rowIndex - offset;
        const dataOffset: number = chunk.offset || 0;

        // Null check via bitmap (skip when bitmap is absent, empty, or
        // the column reports zero nulls — an empty Uint8Array is truthy
        // but reading bitmap[0] yields undefined which falsely triggers null)
        const nullBitmap = chunk.nullBitmap;
        if (nullBitmap && nullBitmap.length > 0 && (chunk.nullCount == null || chunk.nullCount > 0)) {
          const bitIdx = dataOffset + localIdx;
          const byteIdx = bitIdx >> 3;
          if (byteIdx < nullBitmap.length && (nullBitmap[byteIdx] & (1 << (bitIdx & 7))) === 0) {
            return null;
          }
        }

        const values = chunk.values;
        const idx = dataOffset + localIdx;

        if (values instanceof BigInt64Array) {
          return Number(values[idx]);
        }
        if (values instanceof Int32Array) {
          const lo = values[idx * 2] >>> 0;
          const hi = values[idx * 2 + 1];
          return hi * 0x100000000 + lo;
        }
        // Unknown buffer type — give up
        return undefined;
      }
      offset += len;
    }
  } catch {
    // Silently fall back
  }
  return undefined;
}

export function arrowTableToRows(table: ArrowTable): Record<string, any>[] {
  const fields = table.schema.fields;

  // Identify Timestamp columns for raw extraction (preserves µs/ns precision).
  const timestampFields = new Set<string>();
  for (const field of fields) {
    if ((field.type as any).typeId === Type.Timestamp) {
      timestampFields.add(field.name);
    }
  }

  // Log once per Timestamp column so we can diagnose precision issues.
  if (timestampFields.size > 0 && table.numRows > 0) {
    timestampFields.forEach((tsName) => {
      const vec = table.getChild(tsName);
      if (vec) {
        const getVal = vec.get(0);
        const rawVal = tryGetRawTimestamp(vec, 0);
        devLog(
          `⏱ Timestamp column "${tsName}": get(0)=${getVal} (${typeof getVal}), raw=${rawVal} (${typeof rawVal})`,
        );
      }
    });
  }

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, any> = {};
    for (const field of fields) {
      const col = field.name;
      if (timestampFields.has(col)) {
        const vec = table.getChild(col);
        const raw = vec ? tryGetRawTimestamp(vec, i) : undefined;
        if (raw !== undefined) {
          row[col] = raw;
        } else {
          row[col] = normalizeArrowValue(vec?.get(i), field.type, col);
        }
      } else {
        row[col] = normalizeArrowValue(table.getChild(col)?.get(i), field.type, col);
      }
    }
    rows.push(row);
  }

  return rows;
}


