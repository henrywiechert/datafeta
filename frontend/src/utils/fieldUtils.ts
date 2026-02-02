import { Field, Aggregation, DataType, Column } from '../types';
import { 
  getResultColumnNameForDateTime,
  getFieldDisplayNameWithDateTime,
  getDateTimePartTooltip as getDateTimeTooltip 
} from '../datetime';
import { generateSyntheticFieldsForGroup } from './syntheticFields';

const DISCRETE_AGGREGATIONS: Aggregation[] = ['min', 'max', 'count', 'count_distinct'];

/**
 * Convert an epoch-like value to a JS Date.
 * Handles seconds, milliseconds, microseconds, and nanoseconds via magnitude heuristics.
 */
function epochToDate(value: any): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  let num: number;
  if (typeof value === 'bigint') {
    // Convert BigInt to number; may lose precision for huge values but ms epoch fits fine.
    num = Number(value);
  } else if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    // If it parses as ISO date string, use that
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed);
    // Otherwise try as numeric
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    num = n;
  } else {
    return null;
  }

  if (!Number.isFinite(num)) return null;

  // Heuristic by magnitude to determine unit:
  // ns ~ 1e18, us ~ 1e15, ms ~ 1e12, s ~ 1e9
  const abs = Math.abs(num);
  let ms: number;
  if (abs >= 1e18) {
    ms = num / 1_000_000; // nanoseconds
  } else if (abs >= 1e15) {
    ms = num / 1000; // microseconds
  } else if (abs >= 1e12) {
    ms = num; // milliseconds
  } else {
    ms = num * 1000; // seconds
  }

  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Check if a field is in timeline mode (not distinct mode).
 * Handles both camelCase (dateTimeMode) and snake_case (date_mode) property names.
 */
function isTimelineField(f: Field): boolean {
  // camelCase (frontend Field type)
  if (f.dateTimeMode === 'timeline') return true;
  // snake_case (backend Dimension/Measure type)
  if ((f as any).date_mode === 'timeline') return true;
  return false;
}

/**
 * Build the column name for a field, handling both property naming conventions.
 */
function getFieldColumnName(f: Field): string {
  const datePart = f.dateTimePart || (f as any).date_part;
  const dateMode = f.dateTimeMode || (f as any).date_mode;
  if (datePart && dateMode) {
    return `${f.columnName}_${datePart}_${dateMode}`;
  }
  return getResultColumnName(f);
}

/**
 * Identify timeline fields and convert their epoch values to Date objects.
 * This ensures Observable Plot uses time scales and displays readable dates.
 *
 * Only affects fields with dateTimeMode/date_mode === 'timeline' (not 'distinct').
 * Distinct mode fields (hour 0-23, month 1-12, etc.) are left as integers.
 *
 * @param rows - Data rows from query result
 * @param fields - All fields (dimensions, measures, color, size, etc.)
 * @returns New rows array with timeline columns converted to Date
 */
export function normalizeTimelineData(rows: any[], fields: Field[]): any[] {
  if (!rows || rows.length === 0 || !fields || fields.length === 0) {
    return rows;
  }

  // Find all timeline columns (both continuous and discrete)
  const timelineColumns: string[] = [];
  for (const f of fields) {
    if (isTimelineField(f)) {
      const colName = getFieldColumnName(f);
      if (!timelineColumns.includes(colName)) {
        timelineColumns.push(colName);
      }
    }
  }

  if (timelineColumns.length === 0) {
    return rows; // No transformation needed
  }

  // Transform rows: convert epoch → Date for timeline columns
  return rows.map((row) => {
    const newRow = { ...row };
    for (const col of timelineColumns) {
      const val = newRow[col];
      if (val !== null && val !== undefined && !(val instanceof Date)) {
        const d = epochToDate(val);
        if (d !== null) {
          newRow[col] = d;
        }
      }
    }
    return newRow;
  });
}
const CONTINUOUS_AGGREGATIONS: Aggregation[] = ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'];

/**
 * Gets the list of valid aggregations for a given field based on its rules.
 * @param field The field to check.
 * @returns An array of valid aggregation types.
 */
export function getAvailableAggregations(field: Field): Aggregation[] {
  if (field.type === 'dimension') {
    return []; // Dimensions have no aggregations
  }

  // For measures, available aggregations depend on flavour and data type
  if (field.flavour === 'discrete') {
    // Numerical discrete measures can have continuous aggregations
    if (field.dataType === 'integer' || field.dataType === 'float') {
      return CONTINUOUS_AGGREGATIONS;
    }
    // Non-numerical discrete measures have limited aggregations
    return DISCRETE_AGGREGATIONS;
  }

  return CONTINUOUS_AGGREGATIONS;
}

export function isDimension(field: Field): boolean {
  return field.type === 'dimension';
}

export function isMeasure(field: Field): boolean {
  return field.type === 'measure';
}

/**
 * Gets the column name for a field as it would appear in a query result.
 * Dimensions use their column name directly, while measures use an alias.
 * DateTime parts get a special alias: fieldname_part_mode
 * @param field The field.
 * @returns The name to look for in the query result columns.
 */
export function getResultColumnName(field: Field): string {
  return getResultColumnNameForDateTime(field);
}

/**
 * Gets the display name for a field, including datetime part information if present.
 * @param field The field.
 * @param aliasLookup Optional map from columnName to display alias.
 * @returns A formatted display name.
 */
export function getFieldDisplayName(field: Field, aliasLookup?: Record<string, string>): string {
  return getFieldDisplayNameWithDateTime(field, aliasLookup);
}

/**
 * Gets a tooltip description for a field's datetime part configuration.
 * @param field The field.
 * @returns A description string, or undefined if no datetime part.
 */
export function getDateTimePartTooltip(field: Field): string | undefined {
  return getDateTimeTooltip(field);
}

// =============================================================================
// Column-to-Field Conversion Utilities
// =============================================================================

/**
 * Map backend data type strings to our DataType enum.
 * Handles various database-specific type names (ClickHouse, DuckDB, etc.)
 */
export function mapBackendDataType(backendType: string): DataType {
    const lowerType = backendType.toLowerCase();
    
    if (lowerType.includes('string') || lowerType.includes('varchar') || lowerType.includes('text') || lowerType.includes('char')) {
        return 'string';
    } else if (lowerType.includes('int') || lowerType.includes('bigint') || lowerType.includes('smallint')) {
        return 'integer';
    } else if (lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('decimal') || lowerType.includes('numeric')) {
        return 'float';
    } else if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
        return 'datetime';
    } else {
        // Default fallback
        return 'string';
    }
}

/**
 * Determine default field properties based on data type.
 */
function getDefaultFieldProperties(dataType: DataType): {
    type: 'dimension' | 'measure';
    flavour: 'discrete' | 'continuous';
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | undefined;
} {
    if (dataType === 'string' || dataType === 'datetime') {
        return {
            type: 'dimension',
            flavour: 'discrete',
            aggregation: undefined, // Dimensions don't have aggregation
        };
    } else if (dataType === 'integer' || dataType === 'float') {
        return {
            type: 'measure',
            flavour: 'continuous',
            aggregation: 'sum', // Default aggregation for measures
        };
    } else {
        // Fallback
        return {
            type: 'dimension',
            flavour: 'discrete',
            aggregation: undefined,
        };
    }
}

/**
 * Options for creating a Field from a Column.
 */
export interface CreateFieldOptions {
    /** Include tableName in the field (for multi-table support) */
    includeTableName?: boolean;
    /** Map of column names to display aliases */
    fieldDisplayAliases?: Record<string, string>;
}

/**
 * Create a Field object from a backend Column.
 * Centralizes the column-to-field conversion logic.
 */
export function createFieldFromColumn(col: Column, options: CreateFieldOptions = {}): Field {
    const dataType = mapBackendDataType(col.data_type);
    const { type, flavour, aggregation } = getDefaultFieldProperties(dataType);
    
    const field: Field = {
        id: `field-${col.name}`,
        columnName: col.name,
        type,
        flavour,
        dataType,
        aggregation,
    };
    
    // Apply display alias if provided
    if (options.fieldDisplayAliases && options.fieldDisplayAliases[col.name]) {
        field.displayAlias = options.fieldDisplayAliases[col.name];
    }
    
    // Optionally include table name (for UNION mode with _source_table)
    if (options.includeTableName && col.table_name) {
        (field as any).tableName = col.table_name;
    }
    
    return field;
}

/**
 * Convert an array of backend columns to Field objects.
 */
export function columnsToFields(columns: Column[], options: CreateFieldOptions = {}): Field[] {
    return columns.map(col => createFieldFromColumn(col, options));
}

/**
 * Result of processing columns into a complete field set.
 */
export interface ProcessedFieldsResult {
    /** All fields (real + synthetic) */
    allFields: Field[];
    /** Filtered measure group fields (only those that exist in the new schema) */
    nextMeasureGroupFields: Field[];
}

/**
 * Process columns into a complete field set with measure group filtering and synthetic fields.
 * This encapsulates the common pattern used after fetching columns.
 * 
 * @param columns - Raw columns from backend
 * @param measureGroupFields - Current measure group fields (to be filtered)
 * @param options - Field creation options
 */
export function processColumnsResponse(
    columns: Column[],
    measureGroupFields: Field[],
    options: CreateFieldOptions = {}
): ProcessedFieldsResult {
    // Convert columns to fields
    const fields = columnsToFields(columns, options);
    
    // Filter measure group to only include fields that exist in new schema
    const measureNameSet = new Set(
        fields.filter(field => field.type === 'measure').map(field => field.columnName)
    );
    const nextMeasureGroupFields = (measureGroupFields || [])
        .filter((field) => measureNameSet.has(field.columnName));
    
    // Generate synthetic fields for measure values/names
    const syntheticFields = generateSyntheticFieldsForGroup(
        fields,
        nextMeasureGroupFields.map(field => field.columnName)
    );
    
    return {
        allFields: [...fields, ...syntheticFields],
        nextMeasureGroupFields,
    };
}
