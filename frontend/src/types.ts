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
    table_name?: string;  // Source table for this column (for multi-table support)
}

// --- Multi-Table Support Types --- //

export interface ForeignKeyRelationship {
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
    relationship_type: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

export interface TableJoinDefinition {
    table_name: string;
    join_type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    on_conditions: string[];
    alias?: string;
}

export interface UnionTableDefinition {
    table_name: string;
    filter_condition?: string;
}

export interface VirtualTableDefinition {
    primary_table: string;
    mode: 'join' | 'union';
    joined_tables: TableJoinDefinition[];
    union_tables: UnionTableDefinition[];
    name?: string;
}

export interface TableRelationshipsResponse {
    relationships: ForeignKeyRelationship[];
}

export interface SuggestedJoinsResponse {
    primary_table: string;
    suggested_tables: string[];
}

export interface SuggestedUnionsResponse {
    primary_table: string;
    suggested_tables: string[];
    schema_hash?: string;
}

export interface MergedColumnsResponse {
    columns: Column[];
    virtual_table: VirtualTableDefinition;
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
    // Column casting configuration
    column_casts?: ColumnCasts;
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

// --- Column Casting Types --- //

/**
 * Configuration for casting a single column.
 * Maps column_name -> { cast_type, replacement_pattern }
 */
export interface ColumnCastConfig {
    cast_type: 'BIGINT' | 'INTEGER' | 'DOUBLE' | 'FLOAT' | 'VARCHAR';
    replacement_pattern?: string; // Pattern to replace (e.g., ',' for thousands separator)
}

/**
 * Dictionary of column name -> casting configuration
 * Example: { "Revenue": { cast_type: "BIGINT", replacement_pattern: "," } }
 */
export type ColumnCasts = Record<string, ColumnCastConfig>;

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
    column_casts?: ColumnCasts;  // Column casting configuration
    // NEW: raw fields needed for label rendering (order not significant)
    label_fields?: string[];
    // NEW: Multi-table support - virtual table definition for joined queries
    virtual_table?: VirtualTableDefinition;
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
  // Echo of label fields included (optional)
  label_fields?: string[];
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
  castType?: ColumnCastConfig['cast_type']; // Optional: type to cast this column to
  castReplacement?: string; // Optional: pattern to replace before casting (e.g., ',' for thousands separator)
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
  totalCount?: number; // Total number of unique values (when known)
  originalTotalCount?: number; // Original total count without any regex filter (used to determine if Query Regex should stay visible)
  isPartial?: boolean; // True if only showing partial results (e.g., first 100 of >5000)
  warningMessage?: string; // Warning message to display to user
  appliedRegexQuery?: string; // Backend LIKE pattern currently applied (if any)
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

// --- Save/Load Configuration Types --- //

/**
 * Connection metadata for saved configurations.
 * Excludes sensitive information like passwords.
 */
export interface SavedConnectionMetadata {
  type: 'csv' | 'clickhouse';
  // CSV-specific fields
  file_path?: string;
  csv_delimiter?: string;
  csv_has_header?: boolean;
  csv_decimal_separator?: string;
  csv_thousands_separator?: string;
  csv_date_format?: string;
  csv_timestamp_format?: string;
  // ClickHouse-specific fields (NO password)
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  // Column casting configuration
  column_casts?: ColumnCasts;
}

/**
 * Data source selection state (which database/table is selected)
 */
export interface SavedDataSourceSelection {
  selectedDatabase: string;
  selectedTable: string;
}

/**
 * Complete saved configuration that can be exported/imported
 */
export interface SavedConfiguration {
  version: string; // Semantic version for future compatibility
  exportedAt: string; // ISO timestamp
  appName: string; // "data-slicer" for validation
  connection?: SavedConnectionMetadata; // Optional: may not have connection
  dataSource?: SavedDataSourceSelection; // Optional: may not have selected data
  sheets: Sheet[]; // All sheet configurations
  activeSheetId?: string; // Which sheet was active
  nextSheetNumber: number; // For continuing sheet numbering
}