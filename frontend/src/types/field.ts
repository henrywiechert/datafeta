/**
 * Field Types
 * Draggable field definitions and related types
 */

import { ColumnCastConfig } from './query';

export type FieldType = 'dimension' | 'measure';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';
export type Flavour = 'discrete' | 'continuous';
export type DataType = 'string' | 'integer' | 'float' | 'datetime';
export type DateTimePart = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute' | 'second' | 'millisecond' | 'microsecond' | 'nanosecond';
export type DateTimeMode = 'distinct' | 'timeline';
export type DistributionVariant = 'tick-strip' | 'box-plot';
export type PieVariant = 'pie';

export type DragSource =
  | 'X_AXIS'
  | 'Y_AXIS'
  | 'AVAILABLE_FIELDS'
  | 'FILTER_ZONE'
  | 'COLOR_ZONE'
  | 'BACKGROUND_ZONE'
  | 'SIZE_ZONE'
  | 'SHAPE_ZONE'
  | 'LABEL_ZONE'
  | 'TOOLTIP_ZONE'
  | 'MEASURE_GROUP';

export interface Field {
  id: string; // A unique ID for each chip instance
  columnName: string;
  type: FieldType;
  aggregation?: Aggregation; // Optional, as dimensions don't have it
  flavour: Flavour;
  dataType: DataType;
  axis?: 'x' | 'y';  // Optional: which axis the field is on (for query optimization)
  dateTimePart?: DateTimePart; // Optional: which datetime part to extract
  dateTimeMode?: DateTimeMode; // Optional: distinct (e.g., 12 months) or timeline (e.g., Mar 2023, Mar 2024)
  castType?: ColumnCastConfig['cast_type']; // Optional: type to cast this column to
  castReplacement?: string; // Optional: pattern to replace before casting (e.g., ',' for thousands separator)
  barSortOrder?: 'none' | 'asc' | 'desc'; // Optional: sort order for bar charts
  // Synthetic field properties (MeasureNames/MeasureValues)
  isSynthetic?: boolean; // Flag for synthetic fields
  syntheticType?: 'MeasureNames' | 'MeasureValues'; // Type of synthetic field
  syntheticGroupId?: string; // Measure group ID for synthetic fields
  isTypeChangeable?: boolean; // Whether type can be changed (false for synthetic fields)
  isFlavourChangeable?: boolean; // Whether flavour can be changed (false for synthetic fields)
  // Virtual column flag (copied from Column when creating Field)
  is_virtual?: boolean; // True if this field comes from a virtual/calculated column
  // Validation flag (set upstream when field no longer exists in schema)
  isInvalid?: boolean; // True if field is invalid (e.g., column removed from table)
  
  // Source table name (which physical table this column comes from)
  // Set from Column.table_name in multi-table (JOIN) mode
  sourceTable?: string;
  
  // Display alias (user-defined friendly name for UI display only - does not affect SQL queries)
  displayAlias?: string; // Optional custom display name
}

// Per-field chart override configuration
export type DataLabelMode = 'inherit' | 'on' | 'off';
export type UserChartType = 'line' | 'scatter' | 'tick' | 'bar' | 'gantt' | 'cdf' | 'pie' | 'table-refactor' | 'heatmap';

/**
 * Cell rendering mode for the `table-refactor` chart type.
 * - `auto`: resolves to `text` when label/measure fields are present, else `symbol` (PR 7).
 * - `text`: renders one stacked text row per measure/label inside each cell (PR 7).
 * - `symbol`: renders a Tableau-style symbol mark per cell (color/shape/size encoded) (PR 6).
 */
export type TableCellMode = 'auto' | 'text' | 'symbol';

export interface FieldOverrideState {
  // Color overrides
  colorFieldId?: string | null;
  colorField?: Field | null;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;

  // Size overrides
  sizeFieldId?: string | null;
  sizeField?: Field | null;
  sizeRange?: [number, number];
  manualSize?: number;

  // Label overrides
  displayLabel?: string;
  dataLabelMode?: DataLabelMode;
  labelFields?: Field[];

  // Chart type override
  chartType?: UserChartType;
}

// Query optimization settings
export interface QueryOptimizationSettings {
  forceRemote: boolean;
  sizeThreshold: number;
  maxPointsSingle: number;
  maxPointsFaceted: number;
  maxPointsWithDiscreteColor: number;
  minPerStratumWithDiscreteColor: number;
  lineBudgetMaxRows: number;
  enableRounding: boolean;
  roundingThresholdLight: number;
  roundingThresholdBalanced: number;
  roundingThresholdAggressive: number;
}
