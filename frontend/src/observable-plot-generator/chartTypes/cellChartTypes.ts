// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Cell Chart Types
 * Type definitions for cell chart generation
 */

import * as Plot from '@observablehq/plot';
import { DensityParams, DistributionVariant, Field, LineColorMode, LineVariant } from '../../types';
import { LabelConfig, GanttZoomRange } from '../types';

/**
 * Domain types for shared scales
 */
export type Domains = Record<string, [number, number] | [Date, Date]> | undefined;

/**
 * Context object bundling common chart generation parameters.
 * Reduces parameter passing overhead across handler functions.
 */
export interface ChartContext {
  sharedMeasureDomains?: Domains;
  sharedCategoricalDomains?: Record<string, any[]>;
  colorField?: Field;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  /** Dataset used to derive size-scale domain (use full result set for consistent facet sizing) */
  sizeScaleData?: any[];
  bandThicknessScale?: number;
  colorScheme?: string;
  colorBias?: number;
  colorReversed?: boolean;
  manualColor?: string;
  labelCfg?: LabelConfig;
  tooltipFields?: Field[];
  /** Facet fields to display in tooltips for context (from faceted charts) */
  facetFields?: Field[];
  /** Gantt chart zoom range - when active, filters and clamps bars to this range */
  ganttZoomRange?: GanttZoomRange | null;
  /** Shape encoding field (scatter only, discrete only) */
  shapeField?: Field;
  /** Manual single-shape fallback when no shape field is assigned */
  manualShape?: string;
  /** Variant for the distribution chart family when rendering tick charts. */
  distributionVariant?: DistributionVariant;
  /** Variant for the line chart family when rendering line charts. */
  lineVariant?: LineVariant;
  /** Fill opacity for area chart fills. */
  areaFillOpacity?: number;
  /** Continuous line color: along path vs one line per value. */
  lineColorMode?: LineColorMode;
  /** KDE parameters when rendering density charts. */
  densityParams?: DensityParams;
  xTickFormat?: (d: any) => string;
  yTickFormat?: (d: any) => string;
}

/**
 * Handler function signature for chart type rendering.
 */
export type ChartHandler = (
  data: any[],
  xf: Field,
  yf: Field,
  ctx: ChartContext
) => Plot.PlotOptions;
