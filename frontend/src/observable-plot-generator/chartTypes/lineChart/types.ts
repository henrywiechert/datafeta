// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { ColorChannel, Field, LineColorMode, LineSeriesLabelMode, LineVariant } from '../../../types';
import { LabelConfig } from '../../types';
import type { ColorScaleInfo } from '../../utils/colorSchemeUtils';
import type { LineStyleEncoding } from '../../utils/lineStyleUtils';

export type LineOrientation = 'horizontal' | 'vertical';

/**
 * A column that splits the data into separate lines (color, line style).
 * A line is one combination of values across all series parts.
 */
export interface SeriesPart {
  column: string;
  field?: Field;
}

export interface LineBuildParams {
  data: any[];
  xColumn: string;
  yColumn: string;
  orientation: LineOrientation;
  labels?: { x?: string; y?: string };
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] };
  color?: ColorChannel;
  /**
   * Shared color scale (facet/grid). When omitted, the scale is derived from
   * this cell's rows — which remaps categories that are missing from the cell.
   */
  colorScaleInfo?: ColorScaleInfo | null;
  sizeField?: Field;
  sizeRange?: [number, number];
  manualSize?: number;
  /**
   * Full dataset used to derive the size-scale domain. When provided (e.g. in
   * a faceted chart), the domain is computed from all rows so every facet
   * cell maps the same value to the same stroke width.
   */
  sizeScaleData?: any[];
  labelCfg?: LabelConfig;
  tooltipFields?: Field[];
  /** Facet fields to display in tooltips for context (from faceted charts) */
  facetFields?: Field[];
  /** Original x/y Field objects, used to enrich tooltip labels with aggregation info. */
  xField?: Field;
  yField?: Field;
  variant?: LineVariant;
  areaFillOpacity?: number;
  /** Continuous color: gradient along path vs one line per distinct value. */
  lineColorMode?: LineColorMode;
  /** Direct labelling of each line's end with its color category value. */
  seriesLabels?: LineSeriesLabelMode;
  /** Dash pattern per line, from a discrete field or one fixed style. */
  lineStyle?: LineStyleEncoding;
}

export type LineBudget = {
  maxPoints: number;
  // Prefer allocating a minimum per series when there is discrete color (multiple lines).
  minPerSeries: number;
  // Dot marks are much heavier than a single path; cap dots separately to avoid stack overflows.
  maxDots: number;
};

export type XKind = 'time' | 'number' | 'other';

export type PreparedLineData = {
  clean: any[];
  budgetedSorted: any[];
  dotData: any[];
  axisKind: XKind;
  /**
   * Rows grouped per line (one group per combination of the series columns),
   * ordered by the independent column. Undefined when nothing splits series.
   */
  seriesGroups?: Map<string, any[]>;
};

export type LineMarkConfigs = {
  lineConfig: any;
  areaConfig: any;
  dotConfig: any;
};
