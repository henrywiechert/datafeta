import { Field, Database, Table, QueryResult, FilterConfig, FilterMetadata, VirtualColumnDefinition, FieldOverrideState, UserChartType } from '../../types';

// Define loading operation types
export type LoadingOperationType = 'query' | 'rendering' | 'metadata';

// Define the state interface
export interface VisualizationState {
  xAxisFields: Field[];
  yAxisFields: Field[];
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  selectedDatabase: string;
  selectedTable: string;
  isLoadingMetadata: boolean;
  metadataError: string | null;
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
  // Label configuration state
  labelFields: Field[];
  labelsEnabled: boolean;
  labelSamplingStrategy: 'auto' | 'all' | 'sample';
  labelSamplingThreshold: number;
  labelSampleEvery: number;
  // Tooltip configuration state
  tooltipFields: Field[];
  // Per-operation timing
  operationStartTimes: Record<LoadingOperationType, number | null>;
  activeOperations: LoadingOperationType[];
  modalPrimaryOperation: LoadingOperationType | null;
  // Virtual columns
  virtualColumns: VirtualColumnDefinition[];
  virtualColumnFieldPreferences: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
  // Per-field chart overrides
  fieldOverrides: Record<string, FieldOverrideState>;
  // Global chart type override
  globalChartType: UserChartType | null;
  queryVersion: number;
  // MeasureNames/MeasureValues source tracking
  measureValuesSourceFields: Field[];
}

// Define action types
export type VisualizationAction =
  // Axis actions
  | { type: 'SET_X_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SET_Y_AXIS_FIELDS'; payload: Field[] }
  | { type: 'SWAP_AXIS_FIELDS' }
  | { type: 'MOVE_FIELD_BETWEEN_AXES'; payload: { fieldId: string; fromAxis: 'x' | 'y'; toAxis: 'x' | 'y'; insertIndex?: number } }
  | { type: 'SET_AVAILABLE_FIELDS'; payload: Field[] }
  | { type: 'SET_DATABASES'; payload: Database[] }
  | { type: 'SET_TABLES'; payload: Table[] }
  | { type: 'SET_SELECTED_DATABASE'; payload: string }
  | { type: 'SET_SELECTED_TABLE'; payload: string }
  | { type: 'SET_LOADING_METADATA'; payload: boolean }
  | { type: 'SET_METADATA_ERROR'; payload: string | null }
  | { type: 'UPDATE_FIELD'; payload: Field }
  | { type: 'SET_QUERY_RESULT'; payload: QueryResult | null }
  | { type: 'SET_QUERY_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' }
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
  // Virtual column actions
  | { type: 'SET_VIRTUAL_COLUMNS'; payload: VirtualColumnDefinition[] }
  | { type: 'ADD_VIRTUAL_COLUMN'; payload: VirtualColumnDefinition }
  | { type: 'UPDATE_VIRTUAL_COLUMN'; payload: { index: number; column: VirtualColumnDefinition } }
  | { type: 'REMOVE_VIRTUAL_COLUMN'; payload: number }
  | { type: 'UPDATE_VIRTUAL_COLUMN_FIELD_PREFERENCE'; payload: { columnName: string; preference: { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string } } }
  // Per-field chart override actions
  | { type: 'SET_FIELD_OVERRIDES'; payload: Record<string, FieldOverrideState> }
  | { type: 'UPDATE_FIELD_OVERRIDE'; payload: { fieldId: string; override: Partial<FieldOverrideState> } }
  | { type: 'CLEAR_FIELD_OVERRIDE'; payload: { fieldId: string } }
  // Global chart type action
  | { type: 'SET_GLOBAL_CHART_TYPE'; payload: UserChartType | null }
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
      virtualColumns: VirtualColumnDefinition[];
      virtualColumnFieldPreferences: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
      fieldOverrides: Record<string, FieldOverrideState>;
      globalChartType?: UserChartType | null;
    } }
  // Multi-table actions
  | { type: 'TABLE_JOINS_UNIONS_MODIFIED' }
  // MeasureNames/MeasureValues source tracking actions
  | { type: 'SET_MEASURE_VALUES_SOURCE_FIELDS'; payload: Field[] };

// Helper type for reducer functions
export type ReducerFn = (state: VisualizationState, action: VisualizationAction) => VisualizationState;

