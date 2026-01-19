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
    is_virtual?: boolean;  // Flag for virtual/calculated columns
}

// --- Virtual Column Types --- //

/**
 * Virtual column (calculated column) definition.
 * Allows users to create new columns based on SQL expressions.
 */
export interface VirtualColumnDefinition {
    name: string;                    // Column name (identifier format)
    expression: string;              // SQL expression (e.g., "(revenue - cost) / revenue * 100")
    output_type?: 'numeric' | 'text' | 'datetime';  // Output data type
    description?: string;            // User-friendly description
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
    database?: string;  // Optional database name for cross-database unions
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

// --- Kaggle-Specific Types --- //

export interface KaggleDataset {
    ref: string;                    // Dataset reference (owner/dataset-name)
    title: string;                  // Dataset title
    size_mb: number;                // Size in megabytes
    csv_file_count: number;         // Number of CSV files
    last_updated: string | null;    // Last update timestamp
}

export interface KaggleFile {
    name: string;                   // File name
    size_mb: number;                // Size in megabytes
}

export interface KaggleSearchResponse {
    datasets: KaggleDataset[];
}

export interface KaggleFilesResponse {
    files: KaggleFile[];
}

// Request body for /connect endpoint
export interface ConnectionDetails {
    type: 'csv' | 'clickhouse' | 'kaggle';
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
    // Kaggle configuration options
    kaggle_username?: string;
    kaggle_api_key?: string;
    kaggle_dataset?: string;
    kaggle_csv_files?: string[];
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
    // NEW: Virtual columns (calculated columns) defined by SQL expressions
    virtual_columns?: VirtualColumnDefinition[];
    // NEW: Result budget / reduction hints (frontend-guided safety for rendering)
    result_budget?: ResultBudget;
    // NEW: Force raw rows (no DISTINCT / no GROUP BY) for local caching slices (best-effort)
    force_raw_rows?: boolean;
}

export interface ResultBudget {
    // Max number of rows/points to return for this query (best-effort).
    max_rows: number;
    // Reduction strategy to apply when over budget.
    // - 'none': No sampling
    // - 'random': Random sampling with ORDER BY rand() LIMIT n
    // - 'stratified': Proportional sampling across categories
    // - 'preserve_extremes': Random sampling that guarantees min/max rows for stable axis scales
    strategy: 'none' | 'random' | 'stratified' | 'preserve_extremes';
    // For stratified sampling: column name to stratify by (typically discrete color field)
    stratify_field?: string;
    // Minimum rows per stratum (helps preserve small categories)
    min_per_stratum?: number;
    // For preserve_extremes: fields to preserve min/max for (auto-detects continuous dims if not specified)
    preserve_fields?: string[];
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
 * Field-level optimization hint.
 * Specifies optimization settings for a specific field based on its characteristics.
 */
export interface FieldOptimizationHint {
    field: string;                      // Field name (column name)
    enable_rounding: boolean;           // Apply rounding to this field
    rounding_threshold?: number;        // Custom threshold for this field
    enable_sampling: boolean;           // Apply sampling for this field (future)
    sampling_rate?: number;             // Sampling rate (0.0 to 1.0)
    reason: string;                     // Why this optimization (e.g., "continuous_dimension")
}

/**
 * Optimization hints sent from frontend to backend.
 * Frontend explicitly tells backend what optimizations to apply
 * based on field characteristics and user preferences.
 */
export interface OptimizationHints {
    // NEW: Field-level hints (each field gets its own optimization config)
    field_hints?: FieldOptimizationHint[];
    
    // Global optimizations (apply to entire query)
    enable_global_distinct?: boolean;   // Apply DISTINCT to remove duplicate rows
    
    // DEPRECATED but kept for backward compatibility
    enable_distinct?: boolean;          // Use enable_global_distinct instead
    enable_rounding?: boolean;          // Use field_hints instead
    enable_sampling?: boolean;          // Use field_hints instead
    enable_binning?: boolean;           // Use field_hints instead
    rounding_threshold?: number;        // Use field_hints instead
    
    optimization_level: 'none' | 'light' | 'balanced' | 'aggressive';
    purpose?: string;                   // Optional: describe why these hints
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
export type DragSource =
  | 'X_AXIS'
  | 'Y_AXIS'
  | 'AVAILABLE_FIELDS'
  | 'FILTER_ZONE'
  | 'COLOR_ZONE'
  | 'SIZE_ZONE'
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

// Per-field chart override configuration (color, size, labels, chart type)
export type DataLabelMode = 'inherit' | 'on' | 'off';
export type UserChartType = 'line' | 'scatter' | 'tick' | 'bar' | 'gantt';

export interface FieldOverrideState {
  // Color overrides
  colorFieldId?: string | null; // Optional: use a specific field as color encoding for charts this field contributes to
  colorField?: Field | null; // The actual field object (stored for fields not in availableFields)
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;

  // Size overrides
  sizeFieldId?: string | null; // Optional: use a specific field as size encoding
  sizeField?: Field | null; // The actual field object (stored for fields not in availableFields)
  sizeRange?: [number, number];
  manualSize?: number;

  // Label overrides
  /**
   * Display label override for this field (used for axis titles, legend labels, chart titles).
   */
  displayLabel?: string;
  /**
   * Per-field data label mode:
   * - 'inherit': follow global label configuration
   * - 'on': force labels on for charts this field contributes to
   * - 'off': suppress labels for charts this field contributes to
   */
  dataLabelMode?: DataLabelMode;
  /**
   * Label fields to show as text on charts this field contributes to.
   * Array of Field objects (supports multiple fields that get concatenated).
   */
  labelFields?: Field[];

  // Chart type override
  /**
   * Per-field chart type override.
   * - 'line': line chart (requires continuous dimension on opposite axis)
   * - 'scatter': scatter/dot plot
   * - 'tick': tick strip (distribution visualization)
   * - 'bar': bar chart
   * When undefined, chart type is auto-detected based on field types.
   */
  chartType?: UserChartType;
}

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
  colorBias: number; // -1 (left bias) to 1 (right bias), 0 = centered
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  bandThicknessScale?: number;
  /** Axis domain sharing controls (shared vs independent per axis). */
  independentDomains?: { x: boolean; y: boolean };
  /**
   * Per-field chart overrides keyed by Field.id.
   * Persisted with sheets and saved configurations.
   */
  fieldOverrides?: Record<string, FieldOverrideState>;
  /**
   * Global chart type override (applies to all charts when set).
   * null = auto-detect chart type based on field types.
   */
  globalChartType?: UserChartType | null;
  /**
   * Selected chart type for persistence/export.
   * 'auto' indicates auto-detection; otherwise the user-selected chart type.
   */
  selectedChartType?: UserChartType | 'auto';
  virtualColumns?: VirtualColumnDefinition[]; // Virtual/calculated columns
  virtualColumnFieldPreferences?: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>; // Field preferences for virtual columns
  tooltipFields?: Field[]; // Fields to show in tooltips only (do not affect chart visualization)
  optimizationSettings?: QueryOptimizationSettings;
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
  | { type: 'LOAD_SHEETS'; payload: Sheet[] }
  | { type: 'RESET_WORKSPACE' };

// --- Save/Load Configuration Types --- //

/**
 * Connection metadata for saved configurations.
 * Excludes sensitive information like passwords.
 */
export interface SavedConnectionMetadata {
  type: 'csv' | 'clickhouse' | 'kaggle';
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
  // Kaggle-specific fields (NO API key)
  kaggle_dataset?: string;  // Dataset reference (owner/dataset-name)
  kaggle_csv_files?: string[];  // List of CSV files in the dataset
  // Column casting configuration
  column_casts?: ColumnCasts;
}

/**
 * Data source selection state (which database/table is selected)
 */
export interface SavedDataSourceSelection {
  selectedDatabase: string;
  selectedTable: string;
  fullTableName: string; // Combined db.table or just table for CSV (e.g., "mydb.orders" or "sales.csv")
  unionTables?: Array<{database: string, table_name: string}>; // Tables combined with UNION ALL
  joinedTables?: TableJoinDefinition[]; // Tables joined with the primary table
  virtualColumns?: VirtualColumnDefinition[]; // Session-scoped virtual columns
  virtualColumnFieldPreferences?: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>; // Field preferences for virtual columns
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