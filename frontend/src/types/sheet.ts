/**
 * Sheet Types
 * Multi-sheet workspace and visualization state
 */

import { Field, FieldOverrideState, UserChartType, QueryOptimizationSettings, DistributionVariant, BoxPlotReferenceLineMode } from './field';
import { FilterConfig } from './filter';
import { VirtualColumnDefinition } from './virtualColumn';

// --- Axis/Facet Label Styling Types --- //

export interface XAxisLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical' | 'angled';
}

export interface YAxisLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical';
  widthPx: number | null;
}

export interface AxisLabelStyles {
  xAxis: XAxisLabelStyle;
  yAxis: YAxisLabelStyle;
}

export interface FacetHeaderLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical';
}

export interface FacetTopValuesLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical' | 'angled';
  heightPx: number | null;
}

export interface FacetLeftValuesLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical';
  widthPx: number | null;
}

export interface FacetLabelStyles {
  topHeader: FacetHeaderLabelStyle;
  topValues: FacetTopValuesLabelStyle;
  leftHeader: FacetHeaderLabelStyle & { widthPx: number | null };
  leftValues: FacetLeftValuesLabelStyle;
}

// --- Visualization State Snapshot --- //

export interface VisualizationStateSnapshot {
  xAxisFields: Field[];
  yAxisFields: Field[];
  filterFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  appliedFilterConfigurations: Record<string, FilterConfig>;
  colorField: Field | null;
  colorScheme: string;
  colorBias: number;
  manualColor?: string;
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  bandThicknessScale?: number;
  independentDomains?: { x: boolean; y: boolean };
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  distributionVariant?: DistributionVariant;
  boxPlotReferenceLineMode?: BoxPlotReferenceLineMode;
  showTableRows?: boolean;
  selectedChartType?: UserChartType | 'auto';
  virtualColumns?: VirtualColumnDefinition[];
  virtualColumnFieldPreferences?: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
  tooltipFields?: Field[];
  optimizationSettings?: QueryOptimizationSettings;
  measureGroupFields?: Field[];
  axisLabelStyles?: AxisLabelStyles;
  facetLabelStyles?: FacetLabelStyles;
  // Facet background encoding
  facetBackgroundField?: Field | null;
  facetBackgroundScheme?: string;
  facetBackgroundOpacity?: number;
  // Chart area caption (markdown)
  chartCaption?: string;
  // Shape encoding (scatter only, discrete only)
  shapeField?: Field | null;
  manualShape?: string;
  // Statistical overlays
  overlays?: import('../observable-plot-generator/overlays/types').OverlayConfig[];
  // Filter IDs that are temporarily disabled on this sheet (config preserved)
  disabledFilterIds?: string[];
}

// --- Sheet Types --- //

export interface Sheet {
  id: string;
  name: string;
  visualizationState: VisualizationStateSnapshot;
  createdAt: number;
  lastModified: number;
}

export interface SheetManagerState {
  sheets: Sheet[];
  activeSheetId: string;
  nextSheetNumber: number;
}

export type SheetAction =
  | { type: 'ADD_SHEET'; payload?: Partial<Sheet> }
  | { type: 'REMOVE_SHEET'; payload: string }
  | { type: 'RENAME_SHEET'; payload: { id: string; name: string } }
  | { type: 'SET_ACTIVE_SHEET'; payload: string }
  | { type: 'UPDATE_SHEET_STATE'; payload: { id: string; state: Partial<VisualizationStateSnapshot> } }
  | { type: 'DUPLICATE_SHEET'; payload: string }
  | { type: 'LOAD_SHEETS'; payload: Sheet[] }
  | { type: 'RESET_WORKSPACE' }
  | { type: 'ADD_FILTER_TO_ALL_SHEETS'; payload: { field: Field; config: FilterConfig } }
  | { type: 'REMOVE_FILTER_FROM_ALL_SHEETS'; payload: { fieldId: string } };
