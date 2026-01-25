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
  bandThicknessScale: 1.0,
  // Label configuration defaults
  labelFields: [],
  labelsEnabled: false,
  labelSamplingStrategy: 'auto',
  labelSamplingThreshold: 300,
  labelSampleEvery: 1,
  // Tooltip configuration defaults
  tooltipFields: [],
  // Query optimization settings
  optimizationSettings: {
    forceRemote: false,
    sizeThreshold: 5_000_000,
    maxPointsSingle: 50_000,
    maxPointsFaceted: 50_000,
    maxPointsWithDiscreteColor: 20_000,
    minPerStratumWithDiscreteColor: 200,
    lineBudgetMaxRows: 50_000,
    enableRounding: true,
    roundingThresholdLight: 1000,
    roundingThresholdBalanced: 500,
    roundingThresholdAggressive: 200,
  },
  // Axis domain sharing defaults
  independentDomains: { x: false, y: false },
  // Per-operation timing defaults
  operationStartTimes: { query: null, rendering: null, metadata: null },
  activeOperations: [],
  modalPrimaryOperation: null,
  // Per-field overrides default
  fieldOverrides: {},
  // Global chart type default (null = auto-detect)
  globalChartType: null,
  queryVersion: 0,
  // MeasureNames/MeasureValues source tracking defaults
  measureValuesSourceFields: [],
  // Measure group fields (per-sheet scope)
  measureGroupFields: [],
  // Gantt chart zoom range (null = full data range)
  ganttZoomRange: null,
  // Axis label styling defaults
  axisLabelStyles: {
    xAxis: {
      fontSize: 10,
      orientation: 'horizontal',
    },
    yAxis: {
      fontSize: 10,
      orientation: 'vertical',
      widthPx: null,
    },
  },
};

