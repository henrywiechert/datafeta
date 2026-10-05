// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { detectDefaultUserChartType } from '../observable-plot-generator/helpers/chartTypeResolver';
import type { Field, UserChartType } from '../types';

export interface EffectiveChartTypeInput {
  globalChartType: UserChartType | null | undefined;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null | undefined;
}

/** The chart type the sheet renders: the chosen one, else the auto-detected one. */
export function resolveEffectiveChartType(input: EffectiveChartTypeInput): UserChartType | null {
  if (input.globalChartType) return input.globalChartType;
  return detectDefaultUserChartType(input.xAxisFields, input.yAxisFields, input.colorField);
}

/**
 * True when the sheet renders as a line chart. Line-only settings (line style,
 * line color mode, series labels) are offered and applied only then.
 */
export function isEffectiveLineChart(input: EffectiveChartTypeInput): boolean {
  return resolveEffectiveChartType(input) === 'line';
}
