import { Field, QueryResult, FilterConfig, FilterMetadata, FieldOverrideState, UserChartType, QueryOptimizationSettings, DistributionVariant, TableCellMode } from '../../types';
import { OverlayConfig, OverlayType, OverlayParams } from '../../observable-plot-generator/overlays/types';

// Define loading operation types
export type LoadingOperationType = 'query' | 'rendering' | 'metadata';

// Axis label styling types
export interface XAxisLabelStyle {
  fontSize: number;  // 8-16, default 10
  orientation: 'horizontal' | 'vertical' | 'angled';  // default 'horizontal'
}

export interface YAxisLabelStyle {
  fontSize: number;  // 8-16, default 10
  orientation: 'horizontal' | 'vertical';  // default 'vertical'
  widthPx: number | null;  // null = auto-calculate, or manual override
}

export interface CategoryTickStyles {
  xHeightPx: number | null; // null = auto-calculate, or manual override
  yWidthPx: number | null;
}

export interface AxisLabelStyles {
  xAxis: XAxisLabelStyle;
  yAxis: YAxisLabelStyle;
}

export type FacetLabelAlign = 'start' | 'center' | 'end';
export type FacetWrapMode = 'wrap' | 'nowrap';

// Facet label styling types
export interface FacetHeaderLabelStyle {
  fontSize: number;  // 8-26, default 12
  fontSizeByDepth?: number[];
  orientation: 'horizontal' | 'vertical';
  orientationByDepth?: Array<'horizontal' | 'vertical'>;
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  horizontalAlignByDepth?: FacetLabelAlign[];
  verticalAlignByDepth?: FacetLabelAlign[];
}

export interface FacetTopValuesLabelStyle {
  fontSize: number;  // 8-26, default 10
  orientation: 'horizontal' | 'vertical' | 'angled';
  orientationByDepth?: Array<'horizontal' | 'vertical' | 'angled'>;
  heightPx: number | null;  // null = auto (VALUES_BAND_TOP_PX), or manual override
  heightPxByDepth?: Array<number | null>;
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  horizontalAlignByDepth?: FacetLabelAlign[];
  verticalAlignByDepth?: FacetLabelAlign[];
  wrapMode?: FacetWrapMode;
  wrapModeByDepth?: FacetWrapMode[];
}

export interface FacetLeftValuesLabelStyle {
  fontSize: number;  // 8-26, default 10
  orientation: 'horizontal' | 'vertical';
  orientationByDepth?: Array<'horizontal' | 'vertical'>;
  widthPx: number | null;  // null = auto (VALUES_BAND_LEFT_PX), or manual override
  widthPxByDepth?: Array<number | null>;
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  horizontalAlignByDepth?: FacetLabelAlign[];
  verticalAlignByDepth?: FacetLabelAlign[];
  wrapMode?: FacetWrapMode;
  wrapModeByDepth?: FacetWrapMode[];
}

export interface FacetLabelStyles {
  topHeader: FacetHeaderLabelStyle;
  topValues: FacetTopValuesLabelStyle;
  leftHeader: FacetHeaderLabelStyle & { widthPx: number | null };
  leftValues: FacetLeftValuesLabelStyle;
}

// Define the state interface
// Note: Metadata (databases, tables, selectedDatabase, selectedTable, availableFields,
// isLoadingMetadata, metadataError) is stored in DataSourceContext, not here.
export interface VisualizationState {
  xAxisFields: Field[];
  yAxisFields: Field[];
  queryResult: QueryResult | null;
  queryError: string | null;
  // Loading states
  isLoadingQuery: boolean;
  isLoadingRendering: boolean;
  showLoadingModal: boolean;
  loadingOperationType: LoadingOperationType | null;
  loadingStartTime: number | null;
  canCancelOperation: boolean;
  // Filter states
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  filterMetadata: Record<string, FilterMetadata>;
  appliedFilterConfigurations: Record<string, FilterConfig>;
  // Filter IDs that are temporarily disabled on this sheet (config preserved)
  disabledFilterIds: string[];
  // Color encoding state
  colorField: Field | null;
  colorScheme: string;
  colorBias: number;
  manualColor: string;
  // Facet background encoding state
  facetBackgroundField: Field | null;
  facetBackgroundScheme: string;
  facetBackgroundOpacity: number;
  // Size encoding state
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  bandThicknessScale: number;
  // Shape encoding state (scatter only, discrete only)
  shapeField: Field | null;
  manualShape: string;
  // Label configuration state
  labelFields: Field[];
  labelsEnabled: boolean;
  labelSamplingStrategy: 'auto' | 'all' | 'sample';
  labelSamplingThreshold: number;
  labelSampleEvery: number;
  labelFontSize: number;
  // Tooltip configuration state
  tooltipFields: Field[];
  // Query optimization settings
  optimizationSettings: QueryOptimizationSettings;
  // Axis domain sharing controls
  independentDomains: { x: boolean; y: boolean };
  // Per-operation timing
  operationStartTimes: Record<LoadingOperationType, number | null>;
  activeOperations: LoadingOperationType[];
  modalPrimaryOperation: LoadingOperationType | null;
  // Per-field chart overrides
  fieldOverrides: Record<string, FieldOverrideState>;
  // Global chart type override
  globalChartType: UserChartType | null;
  // Variant for distribution charts (top-level chart type remains 'tick')
  distributionVariant: DistributionVariant;
  // Cell rendering mode for the 'table-refactor' chart type
  tableCellMode: TableCellMode;
  // Current page index for the 'table-refactor' chart type pager (0-based).
  // Page size is a global user setting (see useTablePageSize), not per-sheet.
  tablePage: number;
  // Table rows view mode (raw data table)
  showTableRows: boolean;
  queryVersion: number;
  // MeasureNames/MeasureValues source tracking
  measureValuesSourceFields: Field[];
  // Measure group fields (per-sheet scope)
  // Note: DataSourceContext also has measureGroupFields for session-scoped synthetic
  // field generation. See DataSourceContext.tsx for details on this duplication.
  measureGroupFields: Field[];
  // Gantt chart zoom range (null = full data range)
  ganttZoomRange: { min: number; max: number } | null;
  // Axis label styling
  axisLabelStyles: AxisLabelStyles;
  // Category tick label styling
  categoryTickStyles: CategoryTickStyles;
  // Facet label styling
  facetLabelStyles: FacetLabelStyles;
  // Chart area caption (markdown)
  chartCaption: string;
  // Statistical overlays (regression, moving average, Bollinger bands)
  overlays: OverlayConfig[];
}

// Define action types
// Note: Metadata actions (SET_AVAILABLE_FIELDS, SET_DATABASES, SET_TABLES, SET_SELECTED_DATABASE,
// SET_SELECTED_TABLE, SET_LOADING_METADATA, SET_METADATA_ERROR) have been removed.
// Metadata is now managed exclusively by DataSourceContext.
export type VisualizationAction =
  // Axis actions
  | { type: 'SET_X_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SET_Y_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SWAP_AXIS_FIELDS' }
  | { type: 'MOVE_FIELD_BETWEEN_AXES'; payload: { fieldId: string; fromAxis: 'x' | 'y'; toAxis: 'x' | 'y'; insertIndex?: number } }
  | { type: 'UPDATE_FIELD'; payload: Field }
  | { type: 'SET_QUERY_RESULT'; payload: QueryResult | null }
  | { type: 'SET_QUERY_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' }
  // Reset query state only (used on connection change without clearing visualization config)
  | { type: 'RESET_QUERY_STATE' }
  // Loading actions
  | { type: 'SET_LOADING_QUERY'; payload: boolean }
  | { type: 'SET_LOADING_RENDERING'; payload: boolean }
  | { type: 'SET_LOADING_MODAL'; payload: { show: boolean; operationType?: LoadingOperationType; canCancel?: boolean } }
  | { type: 'SET_LOADING_START_TIME'; payload: number | null }
  | { type: 'CANCEL_OPERATION' }
  | { type: 'COMPLETE_SPECIFIC_OPERATION'; payload: LoadingOperationType }
  | { type: 'RESET_LOADING_STATES' }
  | { type: 'SET_OPERATION_START_TIME'; payload: { op: LoadingOperationType; time: number } }
  | { type: 'ADD_ACTIVE_OPERATION'; payload: LoadingOperationType }
  | { type: 'REMOVE_ACTIVE_OPERATION'; payload: LoadingOperationType }
  | { type: 'SET_MODAL_PRIMARY_OPERATION'; payload: LoadingOperationType | null }
  | { type: 'ENSURE_PRIMARY_OPERATION'; payload: LoadingOperationType }
  | { type: 'REQUEST_SHOW_MODAL'; payload: { operationType: LoadingOperationType; canCancel: boolean } }
  // Filter actions
  | { type: 'SET_FILTER_FIELDS'; payload: Field[] }
  | { type: 'SET_FILTER_CONFIGURATION'; payload: { fieldId: string; config: FilterConfig } }
  | { type: 'SET_AND_APPLY_FILTER_CONFIGURATION_SILENT'; payload: { fieldId: string; config: FilterConfig } }
  | { type: 'SET_FILTER_METADATA'; payload: { fieldId: string; metadata: FilterMetadata } }
  | { type: 'REMOVE_FILTER_CONFIGURATION_SILENT'; payload: string }
  | { type: 'REMOVE_FILTER_CONFIGURATION'; payload: string }
  | { type: 'APPLY_FILTERS' }
  | { type: 'TOGGLE_FILTER_DISABLED'; payload: string }
  // Color encoding actions
  | { type: 'SET_COLOR_FIELD'; payload: Field | null }
  | { type: 'SET_COLOR_SCHEME'; payload: string }
  | { type: 'SET_COLOR_BIAS'; payload: number }
  | { type: 'SET_MANUAL_COLOR'; payload: string }
  | { type: 'REMOVE_COLOR_FIELD' }
  // Facet background encoding actions
  | { type: 'SET_FACET_BACKGROUND_FIELD'; payload: Field | null }
  | { type: 'SET_FACET_BACKGROUND_SCHEME'; payload: string }
  | { type: 'SET_FACET_BACKGROUND_OPACITY'; payload: number }
  | { type: 'REMOVE_FACET_BACKGROUND_FIELD' }
  // Size encoding actions
  | { type: 'SET_SIZE_FIELD'; payload: Field | null }
  | { type: 'SET_SIZE_RANGE'; payload: [number, number] }
  | { type: 'SET_MANUAL_SIZE'; payload: number }
  | { type: 'SET_BAND_THICKNESS_SCALE'; payload: number }
  | { type: 'REMOVE_SIZE_FIELD' }
  // Shape encoding actions (scatter only, discrete only)
  | { type: 'SET_SHAPE_FIELD'; payload: Field | null }
  | { type: 'SET_MANUAL_SHAPE'; payload: string }
  | { type: 'REMOVE_SHAPE_FIELD' }
  // Label actions
  | { type: 'SET_LABEL_FIELDS'; payload: Field[] }
  | { type: 'ADD_LABEL_FIELD'; payload: Field }
  | { type: 'REMOVE_LABEL_FIELD'; payload: string }
  | { type: 'SET_LABELS_ENABLED'; payload: boolean }
  | { type: 'SET_LABEL_SAMPLING_STRATEGY'; payload: 'auto' | 'all' | 'sample' }
  | { type: 'SET_LABEL_SAMPLING_THRESHOLD'; payload: number }
  | { type: 'SET_LABEL_SAMPLE_EVERY'; payload: number }
  | { type: 'SET_LABEL_FONT_SIZE'; payload: number }
  // Tooltip actions
  | { type: 'SET_TOOLTIP_FIELDS'; payload: Field[] }
  | { type: 'ADD_TOOLTIP_FIELD'; payload: Field }
  | { type: 'REMOVE_TOOLTIP_FIELD'; payload: string }
  // Axis domain sharing actions
  | { type: 'SET_INDEPENDENT_DOMAIN'; payload: { axis: 'x' | 'y'; independent: boolean } }
  // Per-field chart override actions
  | { type: 'SET_FIELD_OVERRIDES'; payload: Record<string, FieldOverrideState> }
  | { type: 'UPDATE_FIELD_OVERRIDE'; payload: { fieldId: string; override: Partial<FieldOverrideState> } }
  | { type: 'CLEAR_FIELD_OVERRIDE'; payload: { fieldId: string } }
  // Global chart type action
  | { type: 'SET_GLOBAL_CHART_TYPE'; payload: UserChartType | null }
  | { type: 'SET_DISTRIBUTION_VARIANT'; payload: DistributionVariant }
  | { type: 'SET_TABLE_CELL_MODE'; payload: TableCellMode }
  // Table-refactor pagination
  | { type: 'SET_TABLE_PAGE'; payload: number }
  // Table rows view mode action
  | { type: 'SET_SHOW_TABLE_ROWS'; payload: boolean }
  // Query optimization settings
  | { type: 'SET_QUERY_OPTIMIZATION_SETTINGS'; payload: QueryOptimizationSettings }
  | { type: 'UPDATE_QUERY_OPTIMIZATION_SETTINGS'; payload: Partial<QueryOptimizationSettings> }
  // Undo/Redo actions
  | { type: 'RESTORE_UNDOABLE_STATE'; payload: {
      xAxisFields: Field[];
      yAxisFields: Field[];
      filterFields: Field[];
      filterConfigurations: Record<string, FilterConfig>;
      appliedFilterConfigurations: Record<string, FilterConfig>;
      colorField: Field | null;
      colorScheme: string;
      colorBias: number;
      sizeField: Field | null;
      sizeRange: [number, number];
      manualSize: number;
      labelFields?: Field[];
      labelsEnabled?: boolean;
      labelSamplingStrategy?: 'auto' | 'all' | 'sample';
      labelSamplingThreshold?: number;
      labelSampleEvery?: number;
      bandThicknessScale?: number;
      independentDomains?: { x: boolean; y: boolean };
      fieldOverrides: Record<string, FieldOverrideState>;
      globalChartType?: UserChartType | null;
      distributionVariant?: DistributionVariant;
      tableCellMode?: TableCellMode;
      tablePage?: number;
      labelFontSize?: number;
      axisLabelStyles?: AxisLabelStyles;
      categoryTickStyles?: CategoryTickStyles;
      facetLabelStyles?: FacetLabelStyles;
      facetBackgroundField?: Field | null;
      facetBackgroundScheme?: string;
      facetBackgroundOpacity?: number;
      showTableRows?: boolean;
      overlays?: OverlayConfig[];
      shapeField?: Field | null;
      manualColor?: string;
      manualShape?: string;
    } }
  // Multi-table actions
  | { type: 'TABLE_JOINS_UNIONS_MODIFIED' }
  // Query refresh action (used after metadata loads to trigger query execution)
  | { type: 'FORCE_QUERY_REFRESH' }
  // MeasureNames/MeasureValues source tracking actions
  | { type: 'SET_MEASURE_VALUES_SOURCE_FIELDS'; payload: Field[] }
  // Measure group actions (per-sheet scope)
  | { type: 'SET_MEASURE_GROUP_FIELDS'; payload: Field[] }
  | { type: 'ADD_MEASURE_TO_GROUP'; payload: Field }
  | { type: 'REMOVE_MEASURES_FROM_GROUP'; payload: string[] }
  | { type: 'CLEAR_MEASURE_GROUP' }
  // Cache restore action (used when switching sheets with cached data)
  | { type: 'RESTORE_CACHED_QUERY_RESULT'; payload: QueryResult }
  // Gantt chart zoom actions
  | { type: 'SET_GANTT_ZOOM_RANGE'; payload: { min: number; max: number } | null }
  // Axis label styling actions
  | { type: 'SET_X_AXIS_LABEL_STYLE'; payload: Partial<XAxisLabelStyle> }
  | { type: 'SET_Y_AXIS_LABEL_STYLE'; payload: Partial<YAxisLabelStyle> }
  // Category tick styling actions
  | { type: 'SET_CATEGORY_X_HEIGHT_PX'; payload: number | null }
  | { type: 'SET_CATEGORY_Y_WIDTH_PX'; payload: number | null }
  // Facet label styling actions
  | { type: 'SET_FACET_TOP_HEADER_STYLE'; payload: Partial<FacetHeaderLabelStyle> }
  | { type: 'SET_FACET_TOP_VALUES_STYLE'; payload: Partial<FacetTopValuesLabelStyle> }
  | { type: 'SET_FACET_TOP_VALUES_DEPTH_HEIGHT'; payload: { depthIndex: number; heightPx: number | null } }
  | { type: 'SET_FACET_LEFT_HEADER_STYLE'; payload: Partial<FacetHeaderLabelStyle & { widthPx: number | null }> }
  | { type: 'SET_FACET_LEFT_VALUES_STYLE'; payload: Partial<FacetLeftValuesLabelStyle> }
  | { type: 'SET_FACET_LEFT_VALUES_DEPTH_WIDTH'; payload: { depthIndex: number; widthPx: number | null } }
  // Chart caption action
  | { type: 'SET_CHART_CAPTION'; payload: string }
  // Overlay actions
  | { type: 'SET_OVERLAYS'; payload: OverlayConfig[] }
  | { type: 'TOGGLE_OVERLAY'; payload: { type: OverlayType; enabled: boolean } }
  | { type: 'UPDATE_OVERLAY_PARAMS'; payload: { type: OverlayType; params: Partial<OverlayParams> } }
  | { type: 'UPDATE_OVERLAY'; payload: { type: OverlayType; config: Partial<Omit<OverlayConfig, 'type'>> } };

// Helper type for reducer functions
export type ReducerFn = (state: VisualizationState, action: VisualizationAction) => VisualizationState;

