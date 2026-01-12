import { VisualizationState } from './types';

export const initialState: VisualizationState = {
  xAxisFields: [],
  yAxisFields: [],
  availableFields: [],
  databases: [],
  tables: [],
  selectedDatabase: '',
  selectedTable: '',
  isLoadingMetadata: false,
  metadataError: null,
  queryResult: null,
  queryError: null,
  // Loading states
  isLoadingQuery: false,
  isLoadingRendering: false,
  showLoadingModal: false,
  loadingOperationType: null,
  loadingStartTime: null,
  canCancelOperation: false,
  // Filter states
  filterFields: [],
  filterConfigurations: {},
  filterMetadata: {},
  appliedFilterConfigurations: {},
  // Color encoding state
  colorField: null,
  colorScheme: 'tableau10',
  colorBias: 0,
  manualColor: '#1976d2',
  // Size encoding state
  sizeField: null,
  sizeRange: [4, 20],
  manualSize: 10,
  // Label configuration defaults
  labelFields: [],
  labelsEnabled: false,
  labelSamplingStrategy: 'auto',
  labelSamplingThreshold: 300,
  labelSampleEvery: 1,
  // Tooltip configuration defaults
  tooltipFields: [],
  // Axis domain sharing defaults
  independentDomains: { x: false, y: false },
  // Per-operation timing defaults
  operationStartTimes: { query: null, rendering: null, metadata: null },
  activeOperations: [],
  modalPrimaryOperation: null,
  // Virtual columns defaults
  virtualColumns: [],
  virtualColumnFieldPreferences: {},
  // Per-field overrides default
  fieldOverrides: {},
  // Global chart type default (null = auto-detect)
  globalChartType: null,
  queryVersion: 0,
  // MeasureNames/MeasureValues source tracking defaults
  measureValuesSourceFields: [],
};

