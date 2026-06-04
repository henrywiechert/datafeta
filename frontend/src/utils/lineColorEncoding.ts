// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, LineColorMode } from '../types';

/** True when the color field should produce one line/path per distinct color value. */
export function lineColorSplitsSeries(
  colorField: Field | null | undefined,
  lineColorMode: LineColorMode = 'alongPath',
): boolean {
  if (!colorField) return false;
  if (colorField.flavour === 'discrete') return true;
  return lineColorMode === 'bySeries';
}

/** Show the along-path vs by-series toggle (continuous color on a line chart). */
export function shouldShowLineColorModeControl(
  colorField: Field | null | undefined,
  isLineChart: boolean,
): boolean {
  return isLineChart && !!colorField && colorField.flavour === 'continuous';
}
