// Types mirroring backend models

export interface Database {
    name: string;
}

export interface Table {
    name: string;
}

export interface Column {
    name: string;
    data_type: string;
}

// Request body for /connect endpoint
export interface ConnectionDetails {
    type: 'csv' | 'clickhouse';
    file_path?: string;
    connection_string?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    // CSV configuration options
    csv_delimiter?: string;
    csv_has_header?: boolean;
    csv_decimal_separator?: string;
    csv_thousands_separator?: string;
    csv_date_format?: string;
    csv_timestamp_format?: string;
}

// Response types for list endpoints
export interface DatabaseListResponse {
    databases: Database[];
}

export interface TableListResponse {
    tables: Table[];
}

export interface ColumnListResponse {
    columns: Column[];
}

// --- Query API Types --- //

export interface Measure {
    field: string;
    aggregation: 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max';
    alias: string;
}

export interface Filter {
    field: string;
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not in' | 'like' | 'ilike' | 'is null' | 'is not null';
    value: any;
    date_part?: DateTimePart;
    date_mode?: DateTimeMode;
}

export interface OrderBy {
    field: string;
    direction?: 'asc' | 'desc';
}

export interface Dimension {
    field: string;
    flavour: Flavour;
    axis?: 'x' | 'y';  // Optional: which axis the dimension is on
    date_part?: DateTimePart; // Optional: which datetime part to extract
    date_mode?: DateTimeMode; // Optional: distinct or timeline mode
}

export interface QueryDescription {
    target_table: string;
    target_database?: string;
    dimensions?: Dimension[];
    measures?: Measure[];
    filters?: Filter[];
    orderBy?: OrderBy[];
    limit?: number;
    offset?: number;
    optimization_hints?: OptimizationHints;  // Phase 1: Frontend can send explicit optimization hints
}

export interface QueryResultColumn {
    name: string;
    type: string;
}

export interface QueryResult {
    columns: QueryResultColumn[];
    rows: { [key: string]: any }[];
    row_count: number;
    query_sql?: string;
    error?: string;
    // Optimization metadata (Phase 1)
    optimizations_applied?: OptimizationMetadata[];
    original_estimate?: number;
    reduction_factor?: number;
    optimization_hints_used?: OptimizationHints | null;
    optimization_override?: OptimizationOverride | null;
    result_dimensions?: ResultDimensions;
}

// --- Optimization Types (Phase 1) ---

/**
 * Optimization hints sent from frontend to backend.
 * Frontend explicitly tells backend what optimizations to apply
 * based on chart type and user preferences.
 */
export interface OptimizationHints {
    enable_distinct: boolean;          // Apply DISTINCT to remove duplicate pairs
    enable_rounding: boolean;          // Apply rounding to continuous dimensions
    enable_sampling: boolean;          // Apply sampling for large raw queries
    enable_binning: boolean;           // Apply binning (future feature)
    rounding_threshold?: number;       // Custom threshold for when to apply rounding
    optimization_level: 'none' | 'light' | 'balanced' | 'aggressive';
    purpose?: string;                  // Optional: describe why these hints (e.g., "scatter_plot")
}

/**
 * Backend override information.
 * Backend may override hints (e.g., for small tables where optimization overhead > benefit).
 */
export interface OptimizationOverride {
    skip_all_optimizations: boolean;
    reason: 'table_too_small' | 'user_disabled' | 'query_too_simple' | 'other';
    table_stats?: {
        row_count: number;
        column_count: number;
        threshold: number;
    };
}

/**
 * Result dimensions for display in UI.
 * Shows the size of the result set.
 */
export interface ResultDimensions {
    rows: number;
    columns: number;
    size_display: string;  // Formatted string like "4,800 × 2"
}

/**
 * Metadata about a single optimization that was applied.
 */
export interface OptimizationMetadata {
    strategy: string;
    reduction?: string;
    rounding_config?: Record<string, number>;
    details?: string;
}

// --- New Types for Draggable Fields ---

export type FieldType = 'dimension' | 'measure';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';
export type Flavour = 'discrete' | 'continuous';
export type DataType = 'string' | 'integer' | 'float' | 'datetime';
export type DateTimePart = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute' | 'second' | 'millisecond' | 'microsecond' | 'nanosecond';
export type DateTimeMode = 'distinct' | 'timeline';
export type DragSource = 'X_AXIS' | 'Y_AXIS' | 'AVAILABLE_FIELDS' | 'FILTER_ZONE' | 'COLOR_ZONE' | 'SIZE_ZONE';

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
}

// --- Filter Types --- //

export type FilterType = 'discrete' | 'continuous' | 'datetime';

// Base filter configuration
interface BaseFilterConfig {
  fieldId: string;
  columnName: string;
  type: FilterType;
  dateTimePart?: DateTimePart;
  dateTimeMode?: DateTimeMode;
}

// Discrete filter: user selects from available values
export interface DiscreteFilterConfig extends BaseFilterConfig {
  type: 'discrete';
  selectedValues: any[];
}

// Continuous filter: user sets min/max range
export interface ContinuousFilterConfig extends BaseFilterConfig {
  type: 'continuous';
  min: number | null;
  max: number | null;
}

// DateTime filter: user sets date range (simplified)
export interface DateTimeFilterConfig extends BaseFilterConfig {
  type: 'datetime';
  startDate: string | null; // ISO string format
  endDate: string | null;   // ISO string format
}

// Union type for all filter configurations
export type FilterConfig = DiscreteFilterConfig | ContinuousFilterConfig | DateTimeFilterConfig;

// Metadata for filter configuration (available values or ranges)
interface BaseFilterMetadata {
  fieldId: string;
  columnName: string;
  type: FilterType;
  loading: boolean;
  error?: string;
}

export interface DiscreteFilterMetadata extends BaseFilterMetadata {
  type: 'discrete';
  availableValues: any[];
}

export interface ContinuousFilterMetadata extends BaseFilterMetadata {
  type: 'continuous';
  min: number;
  max: number;
}

export interface DateTimeFilterMetadata extends BaseFilterMetadata {
  type: 'datetime';
  min: string; // ISO string
  max: string; // ISO string
}

export type FilterMetadata = DiscreteFilterMetadata | ContinuousFilterMetadata | DateTimeFilterMetadata;

// --- Multi-Sheet Types --- //

// Snapshot of visualization state for persistence in sheets
// Note: These fields are NOT included because they are shared across all sheets:
// - selectedDatabase, selectedTable (data source selection)
// - availableFields (derived from selected table)
// - databases, tables (metadata lists)
export interface VisualizationStateSnapshot {
  xAxisFields: Field[];
  yAxisFields: Field[];
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  appliedFilterConfigurations: Record<string, FilterConfig>;
  colorField: Field | null;
  colorScheme: string;
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
}

// Sheet represents a single visualization configuration
export interface Sheet {
  id: string;
  name: string;
  visualizationState: VisualizationStateSnapshot;
  createdAt: number;
  lastModified: number;
}

// Sheet manager state
export interface SheetManagerState {
  sheets: Sheet[];
  activeSheetId: string;
  nextSheetNumber: number;
}

// Actions for sheet management
export type SheetAction =
  | { type: 'ADD_SHEET'; payload?: Partial<Sheet> }
  | { type: 'REMOVE_SHEET'; payload: string }
  | { type: 'RENAME_SHEET'; payload: { id: string; name: string } }
  | { type: 'SET_ACTIVE_SHEET'; payload: string }
  | { type: 'UPDATE_SHEET_STATE'; payload: { id: string; state: Partial<VisualizationStateSnapshot> } }
  | { type: 'DUPLICATE_SHEET'; payload: string }
  | { type: 'LOAD_SHEETS'; payload: Sheet[] };