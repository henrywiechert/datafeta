// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import {
  DISCRETE_OTHER_LABEL,
  DiscretePaletteScale,
  deriveDiscretePaletteScale,
  getPaletteItemForValue,
} from './discretePaletteScale';

/** Line styles assigned to the values of a line-style field, in order. */
export const LINE_STYLES = ['solid', 'dashed', 'dotted', 'dashDot', 'longDash'] as const;

/** Style reserved for the "Other" bucket (top-N overflow and nulls). */
export const LINE_STYLE_OTHER = 'dashDotDot';

export type LineStyleOption = (typeof LINE_STYLES)[number];
export type LineStyleName = LineStyleOption | typeof LINE_STYLE_OTHER;

/** Default fixed style when no line-style field is assigned. */
export const DEFAULT_MANUAL_LINE_STYLE: LineStyleOption = 'solid';

/**
 * SVG dash patterns, sized for the default 2px stroke with Plot's round line
 * caps (a 0.5 dash renders as a dot). `undefined` draws a solid line.
 */
const DASH_ARRAYS: Record<LineStyleName, string | undefined> = {
  solid: undefined,
  dashed: '6,5',
  dotted: '0.5,4',
  dashDot: '8,4,0.5,4',
  longDash: '14,5',
  dashDotDot: '8,4,0.5,4,0.5,4',
};

const LINE_STYLE_TITLES: Record<LineStyleName, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  dashDot: 'Dash-dot',
  longDash: 'Long dash',
  dashDotDot: 'Dash-dot-dot',
};

export function getLineStyleDashArray(style: LineStyleName): string | undefined {
  return DASH_ARRAYS[style];
}

export function getLineStyleTitle(style: LineStyleName): string {
  return LINE_STYLE_TITLES[style];
}

export function isLineStyleOption(value: string | null | undefined): value is LineStyleOption {
  return LINE_STYLES.includes(value as LineStyleOption);
}

export function resolveManualLineStyle(value: string | null | undefined): LineStyleOption {
  return isLineStyleOption(value) ? value : DEFAULT_MANUAL_LINE_STYLE;
}

export type LineStyleScale = DiscretePaletteScale<LineStyleName>;

/**
 * Derive the value → line style mapping for a discrete field. See
 * `deriveDiscretePaletteScale` for domain ordering and Other bucketing.
 */
export function deriveLineStyleScale(rows: any[], field: Field): LineStyleScale {
  return deriveDiscretePaletteScale<LineStyleName>(rows, field, {
    palette: LINE_STYLES,
    otherItem: LINE_STYLE_OTHER,
    otherLabel: DISCRETE_OTHER_LABEL,
  });
}

export function getLineStyleForValue(value: any, scale: LineStyleScale): LineStyleName {
  return getPaletteItemForValue(value, scale);
}

/** Line style as it travels through the generator to the line builder. */
export interface LineStyleEncoding {
  field?: Field;
  /** Fixed style while no field is assigned. */
  manual: LineStyleOption;
  /**
   * Value → style mapping, derived once from the full result rows so every
   * facet cell maps a value to the same style. Null without a field.
   */
  scale: LineStyleScale | null;
}

export function buildLineStyleEncoding(
  field: Field | undefined,
  manual: string | undefined,
  rows: any[] | undefined,
): LineStyleEncoding {
  return {
    field,
    manual: resolveManualLineStyle(manual),
    scale: field ? deriveLineStyleScale(rows ?? [], field) : null,
  };
}
