import { VisualizationState } from './types';
import { SIZE_DEFAULT_FALLBACK } from '../../config/chartLayoutConfig';
import { DEFAULT_MANUAL_COLOR } from '../../config/colorSchemes';
import { DEFAULT_MANUAL_SHAPE } from '../../observable-plot-generator/utils/shapeUtils';
import { DEFAULT_OVERLAYS } from '../../observable-plot-generator/overlays/types';

// Note: Metadata (databases, tables, selectedDatabase, selectedTable, availableFields,
// isLoadingMetadata, metadataError) is now stored in DataSourceContext, not here.
export const initialState: VisualizationState = {
  xAxisFields: [],
  yAxisFields: [],
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
  disabledFilterIds: [],
  // Color encoding state
  colorField: null,
  colorScheme: 'tableau10',
  colorBias: 0,
  manualColor: DEFAULT_MANUAL_COLOR,
  // Facet background encoding state
  facetBackgroundField: null,
  facetBackgroundScheme: 'tableau10',
  facetBackgroundOpacity: 0.12,
  // Size encoding state
  sizeField: null,
  sizeRange: [4, 20],
  manualSize: SIZE_DEFAULT_FALLBACK,
  bandThicknessScale: 1.0,
  // Shape encoding state (scatter only, discrete only)
  shapeField: null,
  manualShape: DEFAULT_MANUAL_SHAPE,
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
    forceRemote: true,
    sizeThreshold: 5_000_000,
    maxPointsSingle: 50_000,
    maxPointsFaceted: 50_000,
    maxPointsWithDiscreteColor: 20_000,
    minPerStratumWithDiscreteColor: 200,
    lineBudgetMaxRows: 50_000,
    enableRounding: false,
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
  distributionVariant: 'tick-strip',
  boxPlotReferenceLineMode: 'none',
  // Table rows view mode default
  showTableRows: false,
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
  // Facet label styling defaults
  facetLabelStyles: {
    topHeader: {
      fontSize: 12,
      orientation: 'horizontal',
    },
    topValues: {
      fontSize: 10,
      orientation: 'horizontal',
      heightPx: null,
    },
    leftHeader: {
      fontSize: 12,
      orientation: 'vertical',
      widthPx: null,
    },
    leftValues: {
      fontSize: 10,
      orientation: 'vertical',
      widthPx: null,
    },
  },
  // Chart area caption
  chartCaption: '## Chart Title',
  // Statistical overlays (all start disabled)
  overlays: DEFAULT_OVERLAYS,
};

