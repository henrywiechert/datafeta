/**
 * Cell Chart Types
 * Type definitions for cell chart generation
 */

import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
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
  bandThicknessScale?: number;
  colorScheme?: string;
  colorBias?: number;
  manualColor?: string;
  labelCfg?: LabelConfig;
  tooltipFields?: Field[];
  /** Facet fields to display in tooltips for context (from faceted charts) */
  facetFields?: Field[];
  /** Gantt chart zoom range - when active, filters and clamps bars to this range */
  ganttZoomRange?: GanttZoomRange | null;
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
