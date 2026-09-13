// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fit a Zoom-facet dialog to this cell's data.
 *
 * Grid cells bake in shared (or row/column) domains so facets stay comparable.
 * The zoom dialog is an isolated view of one cell, so:
 *   - continuous X/Y drop their domain and Plot autoscales from this cell's marks
 *     (including after stack transforms, which we must not recompute here)
 *   - band X/Y keep order but drop categories that do not appear in this cell
 *   - color is left untouched
 *   - heatmap size-encoded axes (`__discreteAxes`) keep their index domain
 */

type AxisName = 'x' | 'y';

function domainValueKey(value: unknown): string {
  if (value instanceof Date) return `date:${value.getTime()}`;
  if (value === null || value === undefined) return `null:${String(value)}`;
  return `${typeof value}:${String(value)}`;
}

function isBandAxis(axis: any): boolean {
  return axis?.type === 'band' && Array.isArray(axis?.domain);
}

function isContinuousPairDomain(domain: unknown, type?: string): boolean {
  if (type === 'band') return false;
  if (!Array.isArray(domain) || domain.length !== 2) return false;
  const [a, b] = domain;
  if (a instanceof Date || b instanceof Date) return true;
  if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a)) return true;
  return (
    typeof a === 'number' && Number.isFinite(a) &&
    typeof b === 'number' && Number.isFinite(b)
  );
}

function collectCellRows(options: any): any[] {
  const tooltipData = options?.__customTooltip?.data;
  if (Array.isArray(tooltipData) && tooltipData.length > 0) {
    return tooltipData;
  }
  for (const mark of options?.marks ?? []) {
    const data = mark?.data;
    if (Array.isArray(data) && data.length > 0 && data.some((row: unknown) => row && typeof row === 'object')) {
      return data;
    }
  }
  return [];
}

function channelColumn(marks: any[] | undefined, axis: AxisName): string | undefined {
  for (const mark of marks ?? []) {
    const channels = mark?.channels;
    if (channels) {
      for (const name of [axis, `${axis}1`]) {
        const value = channels[name]?.value;
        if (typeof value === 'string' && value.length > 0) return value;
      }
    }
    const optsValue = mark?.opts?.[axis];
    if (typeof optsValue === 'string' && optsValue.length > 0) return optsValue;
  }
  return undefined;
}

function presentKeys(rows: any[], column: string | undefined, domain: unknown[]): Set<string> {
  const wanted = new Set(domain.map(domainValueKey));
  const present = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (column) {
      const key = domainValueKey((row as any)[column]);
      if (wanted.has(key)) present.add(key);
      continue;
    }
    for (const value of Object.values(row)) {
      const key = domainValueKey(value);
      if (wanted.has(key)) present.add(key);
    }
  }
  return present;
}

function filterBandDomain(domain: unknown[], rows: any[], column: string | undefined): unknown[] {
  const present = presentKeys(rows, column, domain);
  const filtered = domain.filter((value) => present.has(domainValueKey(value)));
  return filtered.length > 0 ? filtered : domain;
}

function omitDomain(axis: any): any {
  const { domain: _domain, ...rest } = axis;
  return rest;
}

function rescaleOneAxis(
  axis: any,
  axisName: AxisName,
  rows: any[],
  marks: any[] | undefined,
  discreteAxis: boolean,
): any {
  if (!axis || rows.length === 0) return axis;
  if (discreteAxis) return axis;

  if (isBandAxis(axis)) {
    return {
      ...axis,
      domain: filterBandDomain(axis.domain, rows, channelColumn(marks, axisName)),
    };
  }

  if (isContinuousPairDomain(axis.domain, axis.type)) {
    return omitDomain(axis);
  }

  return axis;
}

/**
 * Return rescaled `x` / `y` axis options for the Zoom facet dialog.
 * Callers should replace only those two keys; `color` and marks stay as-is.
 */
export function rescaleZoomPlotAxes(options: any): { x?: any; y?: any } {
  const rows = collectCellRows(options);
  const marks = options?.marks;
  const discrete = options?.__discreteAxes ?? {};
  return {
    x: rescaleOneAxis(options?.x, 'x', rows, marks, discrete.x === true),
    y: rescaleOneAxis(options?.y, 'y', rows, marks, discrete.y === true),
  };
}
