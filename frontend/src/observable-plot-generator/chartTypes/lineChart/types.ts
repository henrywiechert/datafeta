// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { ColorChannel, Field, LineColorMode, LineVariant } from '../../../types';
import { LabelConfig } from '../../types';

export type LineOrientation = 'horizontal' | 'vertical';

export interface LineBuildParams {
  data: any[];
  xColumn: string;
  yColumn: string;
  orientation: LineOrientation;
  labels?: { x?: string; y?: string };
  domain?: { x?: [number, number] | [Date, Date]; y?: [number, number] | [Date, Date] };
  color?: ColorChannel;
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
};

export type LineMarkConfigs = {
  lineConfig: any;
  areaConfig: any;
  dotConfig: any;
};
