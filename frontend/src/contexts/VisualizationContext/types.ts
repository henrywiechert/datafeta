import { Field, QueryResult, FilterConfig, FilterMetadata, FieldOverrideState, UserChartType, QueryOptimizationSettings } from '../../types';

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

export interface AxisLabelStyles {
  xAxis: XAxisLabelStyle;
  yAxis: YAxisLabelStyle;
}

// Facet label styling types
export interface FacetHeaderLabelStyle {
  fontSize: number;  // 8-26, default 12
  orientation: 'horizontal' | 'vertical';
}

export interface FacetTopValuesLabelStyle {
  fontSize: number;  // 8-26, default 10
  orientation: 'horizontal' | 'vertical' | 'angled';
  heightPx: number | null;  // null = auto (VALUES_BAND_TOP_PX), or manual override
}

export interface FacetLeftValuesLabelStyle {
  fontSize: number;  // 8-26, default 10
  orientation: 'horizontal' | 'vertical';
  widthPx: number | null;  // null = auto (VALUES_BAND_LEFT_PX), or manual override
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
  // Color encoding state
  colorField: Field | null;
  colorScheme: string;
  colorBias: number;
  manualColor: string;
  // Size encoding state
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  bandThicknessScale: number;
  // Label configuration state
  labelFields: Field[];
  labelsEnabled: boolean;
  labelSamplingStrategy: 'auto' | 'all' | 'sample';
  labelSamplingThreshold: number;
  labelSampleEvery: number;
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
  // Facet label styling
  facetLabelStyles: FacetLabelStyles;
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
  | { type: 'SET_FILTER_METADATA'; payload: { fieldId: string; metadata: FilterMetadata } }
  | { type: 'REMOVE_FILTER_CONFIGURATION'; payload: string }
  | { type: 'APPLY_FILTERS' }
  // Color encoding actions
  | { type: 'SET_COLOR_FIELD'; payload: Field | null }
  | { type: 'SET_COLOR_SCHEME'; payload: string }
  | { type: 'SET_COLOR_BIAS'; payload: number }
  | { type: 'SET_MANUAL_COLOR'; payload: string }
  | { type: 'REMOVE_COLOR_FIELD' }
  // Size encoding actions
  | { type: 'SET_SIZE_FIELD'; payload: Field | null }
  | { type: 'SET_SIZE_RANGE'; payload: [number, number] }
  | { type: 'SET_MANUAL_SIZE'; payload: number }
  | { type: 'SET_BAND_THICKNESS_SCALE'; payload: number }
  | { type: 'REMOVE_SIZE_FIELD' }
  // Label actions
  | { type: 'SET_LABEL_FIELDS'; payload: Field[] }
  | { type: 'ADD_LABEL_FIELD'; payload: Field }
  | { type: 'REMOVE_LABEL_FIELD'; payload: string }
  | { type: 'SET_LABELS_ENABLED'; payload: boolean }
  | { type: 'SET_LABEL_SAMPLING_STRATEGY'; payload: 'auto' | 'all' | 'sample' }
  | { type: 'SET_LABEL_SAMPLING_THRESHOLD'; payload: number }
  | { type: 'SET_LABEL_SAMPLE_EVERY'; payload: number }
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
      bandThicknessScale?: number;
      independentDomains?: { x: boolean; y: boolean };
      fieldOverrides: Record<string, FieldOverrideState>;
      globalChartType?: UserChartType | null;
      axisLabelStyles?: AxisLabelStyles;
      facetLabelStyles?: FacetLabelStyles;
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
  // Facet label styling actions
  | { type: 'SET_FACET_TOP_HEADER_STYLE'; payload: Partial<FacetHeaderLabelStyle> }
  | { type: 'SET_FACET_TOP_VALUES_STYLE'; payload: Partial<FacetTopValuesLabelStyle> }
  | { type: 'SET_FACET_LEFT_HEADER_STYLE'; payload: Partial<FacetHeaderLabelStyle & { widthPx: number | null }> }
  | { type: 'SET_FACET_LEFT_VALUES_STYLE'; payload: Partial<FacetLeftValuesLabelStyle> };

// Helper type for reducer functions
export type ReducerFn = (state: VisualizationState, action: VisualizationAction) => VisualizationState;

