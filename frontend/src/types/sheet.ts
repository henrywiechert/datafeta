// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Sheet Types
 * Multi-sheet workspace and visualization state
 */

import { Field, FieldOverrideState, UserChartType, QueryOptimizationSettings, DistributionVariant, LineVariant } from './field';
import { FilterConfig } from './filter';
import { VirtualColumnDefinition } from './virtualColumn';

// --- Axis/Facet Label Styling Types --- //

export interface XAxisLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical' | 'angled';  // axis (field-name) label
  categoryOrientation: 'horizontal' | 'vertical' | 'angled';  // category tick labels
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
  fontSizeByDepth?: number[];
  orientation: 'horizontal' | 'vertical';
  orientationByDepth?: Array<'horizontal' | 'vertical'>;
  horizontalAlign?: 'start' | 'center' | 'end';
  verticalAlign?: 'start' | 'center' | 'end';
  horizontalAlignByDepth?: Array<'start' | 'center' | 'end'>;
  verticalAlignByDepth?: Array<'start' | 'center' | 'end'>;
}

export interface FacetTopValuesLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical' | 'angled';
  orientationByDepth?: Array<'horizontal' | 'vertical' | 'angled'>;
  heightPx: number | null;
  heightPxByDepth?: Array<number | null>;
  horizontalAlign?: 'start' | 'center' | 'end';
  verticalAlign?: 'start' | 'center' | 'end';
  horizontalAlignByDepth?: Array<'start' | 'center' | 'end'>;
  verticalAlignByDepth?: Array<'start' | 'center' | 'end'>;
  wrapMode?: 'wrap' | 'nowrap';
  wrapModeByDepth?: Array<'wrap' | 'nowrap'>;
}

export interface FacetLeftValuesLabelStyle {
  fontSize: number;
  orientation: 'horizontal' | 'vertical';
  orientationByDepth?: Array<'horizontal' | 'vertical'>;
  widthPx: number | null;
  widthPxByDepth?: Array<number | null>;
  horizontalAlign?: 'start' | 'center' | 'end';
  verticalAlign?: 'start' | 'center' | 'end';
  horizontalAlignByDepth?: Array<'start' | 'center' | 'end'>;
  verticalAlignByDepth?: Array<'start' | 'center' | 'end'>;
  wrapMode?: 'wrap' | 'nowrap';
  wrapModeByDepth?: Array<'wrap' | 'nowrap'>;
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
  colorReversed?: boolean;
  manualColor?: string;
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
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  /** @deprecated Persisted in older sheets; now stored under `chartTypeParams.line.variant`. Kept for backward-compatible load/migration. */
  lineVariant?: LineVariant;
  /** @deprecated Persisted in older sheets; now stored under `chartTypeParams.line.areaFillOpacity`. */
  areaFillOpacity?: number;
  /** @deprecated Persisted in older sheets; now stored under `chartTypeParams.distribution.variant`. */
  distributionVariant?: DistributionVariant;
  /** @deprecated Persisted in older sheets; now stored under `chartTypeParams.table.page`. */
  tablePage?: number;
  showTableRows?: boolean;
  // Columns shown in the first-class table view (raw rows)
  tableColumnFields?: Field[];
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
  // Data label styling
  labelFontSize?: number;
  // Statistical overlays
  overlays?: import('../observable-plot-generator/overlays/types').OverlayConfig[];
  // Per-chart-type parameter container (density KDE settings, etc.)
  chartTypeParams?: import('../contexts/VisualizationContext/types').ChartTypeParams;
  // Filter IDs that are temporarily disabled on this sheet (config preserved)
  disabledFilterIds?: string[];
}

// --- Sheet Types --- //

/**
 * Per-sheet panel layout (resize handle positions).
 *
 * Stored on the Sheet directly rather than inside `visualizationState` so it is
 * restored when switching sheets but intentionally kept OUT of visualization
 * snapshots (it's cosmetic UI chrome, not part of the chart definition).
 * All fields are optional; missing values fall back to component defaults.
 */
export interface SheetPanelLayout {
  /** Left (Fields) panel size as a percentage of the horizontal panel group. */
  leftPanelSize?: number;
  /** Middle (Properties) panel size as a percentage of the horizontal panel group. */
  middlePanelSize?: number;
  /** Legend stack width in pixels. */
  legendWidth?: number;
  /** Debug view height in pixels. */
  debugHeight?: number;
}

export interface Sheet {
  id: string;
  name: string;
  visualizationState: VisualizationStateSnapshot;
  /** Per-sheet resize handle positions. Not part of the visualization snapshot. */
  panelLayout?: SheetPanelLayout;
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
  | { type: 'UPDATE_SHEET_PANEL_LAYOUT'; payload: { id: string; layout: Partial<SheetPanelLayout> } }
  | { type: 'DUPLICATE_SHEET'; payload: string }
  | { type: 'LOAD_SHEETS'; payload: Sheet[] }
  | { type: 'RESET_WORKSPACE' }
  | { type: 'ADD_FILTER_TO_ALL_SHEETS'; payload: { field: Field; config: FilterConfig } }
  | { type: 'REMOVE_FILTER_FROM_ALL_SHEETS'; payload: { fieldId: string } };
