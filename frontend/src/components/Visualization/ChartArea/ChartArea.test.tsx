import React from 'react';
import { render, screen } from '@testing-library/react';
import ChartArea from './ChartArea';
import { initialState } from '../../../contexts/VisualizationContext/initialState';
import { useVisualizationContext, useChannels } from '../../../contexts/VisualizationContext';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useSheetContext } from '../../../contexts/SheetContext';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useRenderingCoordinator } from '../../../hooks/useRenderingCoordinator';
import { useTablePageSize } from '../../../hooks/useTablePageSize';
import {
  useChartGeneration,
  useQueryExecution,
  useDataProcessing,
  useDebugView,
  useFullscreen,
  useTableRowsQuery,
} from './hooks';
import { useAdditionalFields } from './hooks/useAdditionalFields';
import { useGanttZoom } from './hooks/useGanttZoom';
import { useFilterActions } from './hooks/useFilterActions';
import { useTableRowsFilterActions } from './hooks/useTableRowsFilterActions';
import { useChartActions } from './hooks/useChartActions';
import { useBrushZoom } from './hooks/useBrushZoom';
import { useRenderingTracking } from './hooks/useRenderingTracking';
import { Field } from '../../../types';

jest.mock('../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: jest.fn(),
  useChannels: jest.fn(),
}));

jest.mock('../../../contexts/DataSourceContext', () => ({
  useDataSource: jest.fn(),
}));

jest.mock('../../../contexts/SheetContext', () => ({
  useSheetContext: jest.fn(),
}));

jest.mock('../../../hooks/useUndoRedo', () => ({
  useUndoRedo: jest.fn(),
}));

jest.mock('../../../hooks/useRenderingCoordinator', () => ({
  useRenderingCoordinator: jest.fn(),
}));

jest.mock('../../../hooks/useSheetCacheCoordinator', () => ({
  useSheetCacheSave: jest.fn(),
}));

jest.mock('../../../hooks/useTablePageSize', () => ({
  useTablePageSize: jest.fn(),
}));

jest.mock('./hooks', () => ({
  useChartGeneration: jest.fn(),
  useQueryExecution: jest.fn(),
  useDataProcessing: jest.fn(),
  useDebugView: jest.fn(),
  useFullscreen: jest.fn(),
  useTableRowsQuery: jest.fn(),
}));

jest.mock('./hooks/useAdditionalFields', () => ({
  useAdditionalFields: jest.fn(),
}));

jest.mock('./hooks/useGanttZoom', () => ({
  useGanttZoom: jest.fn(),
}));

jest.mock('./hooks/useFilterActions', () => ({
  useFilterActions: jest.fn(),
}));

jest.mock('./hooks/useTableRowsFilterActions', () => ({
  useTableRowsFilterActions: jest.fn(),
}));

jest.mock('./hooks/useChartActions', () => ({
  useChartActions: jest.fn(),
}));

jest.mock('./hooks/useBrushZoom', () => ({
  useBrushZoom: jest.fn(),
}));

jest.mock('./hooks/useRenderingTracking', () => ({
  useRenderingTracking: jest.fn(),
}));

jest.mock('./hooks/useSeriesHighlight', () => ({
  useSeriesHighlight: jest.fn(),
}));

jest.mock('../ChartGrid/hooks/useCellSizeOverrides', () => ({
  useCellSizeOverrides: jest.fn(() => ({ overrides: [] })),
}));

jest.mock('../Legend/LegendStack', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="legend-stack">{children}</div>,
}));

jest.mock('../Legend/LegendPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="color-legend" />,
}));

jest.mock('../Legend/BackgroundLegendPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="background-legend" />,
}));

jest.mock('../Legend/ShapeLegendPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="shape-legend" />,
}));

jest.mock('../FacetLimitDialog', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => open ? <div data-testid="facet-limit-dialog" /> : null,
}));

jest.mock('./components/HeatmapSizeBar', () => ({
  __esModule: true,
  default: () => <div data-testid="heatmap-size-bar" />,
}));

jest.mock('./components', () => ({
  ChartRenderer: () => <div data-testid="chart-renderer" />,
  ChartControls: () => <div data-testid="chart-controls" />,
  DebugPanel: () => <div data-testid="debug-panel" />,
}));

jest.mock('../../../utils/queryAffectingConfig', () => ({
  createChartAffectingConfig: jest.fn(() => ({ key: 'config' })),
}));

jest.mock('../../../utils/sheetConfigHash', () => ({
  filtersToHashKey: jest.fn(() => 'filters-hash'),
}));

jest.mock('../../../utils/effectiveFilters', () => ({
  buildEffectiveFilterConfigurations: jest.fn(({ localConfigurations }: { localConfigurations: Record<string, any> }) => localConfigurations),
}));

jest.mock('../../../observable-plot-generator/chartTypes/chartTypePresentation', () => ({
  isTablePresentation: jest.fn(() => false),
}));

const mockUseVisualizationContext = useVisualizationContext as jest.MockedFunction<typeof useVisualizationContext>;
const mockUseChannels = useChannels as jest.MockedFunction<typeof useChannels>;
const mockUseDataSource = useDataSource as jest.MockedFunction<typeof useDataSource>;
const mockUseSheetContext = useSheetContext as jest.MockedFunction<typeof useSheetContext>;
const mockUseUndoRedo = useUndoRedo as jest.MockedFunction<typeof useUndoRedo>;
const mockUseRenderingCoordinator = useRenderingCoordinator as jest.MockedFunction<typeof useRenderingCoordinator>;
const mockUseTablePageSize = useTablePageSize as jest.MockedFunction<typeof useTablePageSize>;
const mockUseChartGeneration = useChartGeneration as jest.MockedFunction<typeof useChartGeneration>;
const mockUseQueryExecution = useQueryExecution as jest.MockedFunction<typeof useQueryExecution>;
const mockUseDataProcessing = useDataProcessing as jest.MockedFunction<typeof useDataProcessing>;
const mockUseDebugView = useDebugView as jest.MockedFunction<typeof useDebugView>;
const mockUseFullscreen = useFullscreen as jest.MockedFunction<typeof useFullscreen>;
const mockUseTableRowsQuery = useTableRowsQuery as jest.MockedFunction<typeof useTableRowsQuery>;
const mockUseAdditionalFields = useAdditionalFields as jest.MockedFunction<typeof useAdditionalFields>;
const mockUseGanttZoom = useGanttZoom as jest.MockedFunction<typeof useGanttZoom>;
const mockUseFilterActions = useFilterActions as jest.MockedFunction<typeof useFilterActions>;
const mockUseTableRowsFilterActions = useTableRowsFilterActions as jest.MockedFunction<typeof useTableRowsFilterActions>;
const mockUseChartActions = useChartActions as jest.MockedFunction<typeof useChartActions>;
const mockUseBrushZoom = useBrushZoom as jest.MockedFunction<typeof useBrushZoom>;
const mockUseRenderingTracking = useRenderingTracking as jest.MockedFunction<typeof useRenderingTracking>;

function buildChannels(overrides: Partial<ReturnType<typeof useChannels>> = {}): ReturnType<typeof useChannels> {
  return {
    color: { field: null, scheme: 'tableau10', bias: 0, manual: {}, ...overrides.color },
    size: { field: null, range: [4, 20], manual: {}, bandThicknessScale: 1, ...overrides.size },
    shape: { field: null, manual: {}, ...overrides.shape },
    facetBackground: { field: null, scheme: 'tableau10', opacity: 0.12, ...overrides.facetBackground },
    label: { fields: [], enabled: false, samplingStrategy: 'auto', samplingThreshold: 300, sampleEvery: 1, ...overrides.label },
    tooltip: { fields: [], ...overrides.tooltip },
  } as ReturnType<typeof useChannels>;
}

function buildField(overrides: Partial<Field>): Field {
  return {
    id: 'field-id',
    columnName: 'field_column',
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
    ...overrides,
  } as Field;
}

describe('ChartArea', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseVisualizationContext.mockReturnValue({
      state: {
        ...initialState,
        globalChartType: 'heatmap',
        queryResult: { rows: [{ category: 'A' }], columns: [] },
      } as any,
      dispatch: jest.fn(),
      startOperation: jest.fn(),
      completeOperation: jest.fn(),
      getUndoableSnapshot: jest.fn(() => ({ snapshot: true })),
    } as any);

    mockUseChannels.mockReturnValue(buildChannels({
      color: {
        field: buildField({ id: 'color-field', columnName: 'color_field', flavour: 'discrete' }),
        scheme: 'tableau10',
        bias: 0,
        manual: 'manual-color',
      },
      facetBackground: {
        field: buildField({ id: 'bg-field', columnName: 'bg_field' }),
        scheme: 'tableau10',
        opacity: 0.12,
      },
      shape: {
        field: buildField({ id: 'shape-field', columnName: 'shape_field' }),
        manual: 'manual-shape',
      },
    }));

    mockUseDataSource.mockReturnValue({
      dataSource: {
        selectedTable: 'orders',
        selectedDatabase: 'analytics',
        virtualTable: null,
        virtualColumns: [],
        sessionAppliedFilterConfigurations: {},
      },
      clearSessionFilters: jest.fn(),
    } as any);

    mockUseSheetContext.mockReturnValue({
      resetWorkspace: jest.fn(),
      activeSheet: { id: 'sheet-1' },
    } as any);

    mockUseUndoRedo.mockReturnValue({
      recordAction: jest.fn(),
      undo: jest.fn(),
      completeUndo: jest.fn(),
      redo: jest.fn(),
      completeRedo: jest.fn(),
      canUndo: true,
      canRedo: true,
    } as any);

    mockUseRenderingCoordinator.mockReturnValue({} as any);
    mockUseTablePageSize.mockReturnValue({ pageSize: 25, setPageSize: jest.fn() });
    mockUseAdditionalFields.mockReturnValue({ additionalColorFields: [], additionalSizeFields: [], additionalLabelFields: [] });
    mockUseDataProcessing.mockReturnValue({ useTableView: false, tableData: { columns: [], rows: [] } } as any);
    mockUseTableRowsQuery.mockReturnValue({ rows: [], columns: [], totalRows: 0, page: 0, pageSize: 25, setPage: jest.fn(), setPageSize: jest.fn(), sortModel: null, setSortModel: jest.fn(), loading: false, error: null } as any);
    mockUseQueryExecution.mockReturnValue({ queryDescription: {}, optimizationHints: {}, viewSpec: {}, lastQueryDecision: null } as any);
    mockUseChartGeneration.mockReturnValue({
      grid: { pagination: null },
      chartInfo: {},
      renderingError: null,
      facetLimitWarning: { exceedsLimit: 'row' },
      onFacetLimitProceed: jest.fn(),
      onFacetLimitCancel: jest.fn(),
    } as any);
    mockUseFilterActions.mockReturnValue({ handleLegendFilterAction: jest.fn(), handleShapeLegendFilterAction: jest.fn(), gridWithTooltipAction: { id: 'grid' } } as any);
    mockUseTableRowsFilterActions.mockReturnValue({ handleTableCellFilterAction: jest.fn() } as any);
    mockUseGanttZoom.mockReturnValue({ ganttFullDataRange: null, handleGanttZoomRangeChange: jest.fn() } as any);
    mockUseChartActions.mockReturnValue({
      handleResetWorkspace: jest.fn(),
      handleSwapAxis: jest.fn(),
      handleUndo: jest.fn(),
      handleRedo: jest.fn(),
      handleIndependentXAxisToggle: jest.fn(),
      handleIndependentYAxisToggle: jest.fn(),
      handleForceRefresh: jest.fn(),
    } as any);
    mockUseBrushZoom.mockReturnValue({ brushDisabled: false, handleBrushEnd: jest.fn(), handleZoomOut: jest.fn(), handleZoomReset: jest.fn(), hasActiveZoomFilters: false } as any);
    mockUseRenderingTracking.mockReturnValue({ handlePlotRenderComplete: jest.fn() } as any);
    mockUseDebugView.mockReturnValue({ isDebugOpen: false, debugHeight: 0, maxDebugHeight: 400, toggleDebugView: jest.fn(), handleDebugResize: jest.fn() } as any);
    mockUseFullscreen.mockReturnValue({ isFullscreen: false, toggleFullscreen: jest.fn(), isSupported: true } as any);
  });

  test('renders heatmap toolbar, all legends, and facet warning dialog when chart state requires them', () => {
    render(<ChartArea />);

    expect(screen.getByTestId('chart-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('chart-controls')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-size-bar')).toBeInTheDocument();
    expect(screen.getByTestId('legend-stack')).toBeInTheDocument();
    expect(screen.getByTestId('color-legend')).toBeInTheDocument();
    expect(screen.getByTestId('background-legend')).toBeInTheDocument();
    expect(screen.getByTestId('shape-legend')).toBeInTheDocument();
    expect(screen.getByTestId('facet-limit-dialog')).toBeInTheDocument();
  });

  test('suppresses heatmap toolbar and legends when rows are absent or table view is active', () => {
    mockUseVisualizationContext.mockReturnValue({
      state: {
        ...initialState,
        globalChartType: 'bar',
        queryResult: { rows: [], columns: [] },
      } as any,
      dispatch: jest.fn(),
      startOperation: jest.fn(),
      completeOperation: jest.fn(),
      getUndoableSnapshot: jest.fn(() => ({ snapshot: true })),
    } as any);
    mockUseDataProcessing.mockReturnValue({ useTableView: true, tableData: { columns: [], rows: [] } } as any);
    mockUseChartGeneration.mockReturnValue({
      grid: null,
      chartInfo: {},
      renderingError: null,
      facetLimitWarning: null,
      onFacetLimitProceed: jest.fn(),
      onFacetLimitCancel: jest.fn(),
    } as any);

    render(<ChartArea />);

    expect(screen.queryByTestId('heatmap-size-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legend-stack')).not.toBeInTheDocument();
    expect(screen.queryByTestId('color-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('background-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shape-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('facet-limit-dialog')).not.toBeInTheDocument();
  });
});