import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, DEFAULT_COLOR_SCHEME } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Line chart for continuous dimension on one axis and continuous measure on the other.
 * xColumn/yColumn are data column names in the query result to use.
 */
export function lineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string },
  domain?: { x?: [number, number]; y?: [number, number] },
  colorField?: Field
): Plot.PlotOptions {
  // Filter to finite numeric values for y; x may be numeric or datetime/ordinal
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[yColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, grid: true },
      y: { label: labels?.y || yColumn, grid: true },
      marks: [],
    };
  }

  // Ensure the line flows left-to-right by sorting by the X dimension
  const toComparable = (v: any): number | string | null => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      if (Number.isFinite(num)) return num;
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
      return v; // fallback lexical
    }
    return null;
  };
  const cleanSorted = clean.slice().sort((a, b) => {
    const ax = toComparable(a[xColumn]);
    const bx = toComparable(b[xColumn]);
    if (ax == null && bx == null) return 0;
    if (ax == null) return 1;
    if (bx == null) return -1;
    if (typeof ax === 'string' || typeof bx === 'string') return String(ax).localeCompare(String(bx));
    return (ax as number) - (bx as number);
  });

  const xLabel = labels?.x || xColumn;
  const yLabel = labels?.y || yColumn;
  const lineConfig: any = { x: xColumn, y: yColumn };
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel },
    y: { value: yColumn, label: yLabel },
    r: 2,
    channels: {
      [xLabel]: { value: xColumn, label: xLabel },
      [yLabel]: { value: yColumn, label: yLabel }
    },
    tip: { pointer: 'x', preferredAnchor: 'top-right', format: { [xLabel]: true, [yLabel]: true, x: false, y: false, fill: false, r: false } }
  };
  
  if (colorField) {
    // Add color encoding and z channel for grouping by color
    const colorColumnName = getResultColumnName(colorField);
    lineConfig.stroke = colorColumnName;
    lineConfig.z = colorColumnName;
    dotConfig.fill = colorColumnName;
  } else {
    lineConfig.stroke = DEFAULT_CHART_COLOR;
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }
  
  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, grid: true, domain: domain?.x },
    y: { label: labels?.y || yColumn, grid: true, domain: domain?.y },
    marks: [
      Plot.line(cleanSorted, lineConfig),
      Plot.dot(cleanSorted, dotConfig),
    ],
  };
  
  if (colorField) {
    // Get unique color values for the domain
    const colorColumnName = getResultColumnName(colorField);
    const colorValues = Array.from(new Set(cleanSorted.map(row => row[colorColumnName])));
    plotOptions.color = {
      domain: colorValues,
      scheme: DEFAULT_COLOR_SCHEME,
      type: 'ordinal' as any
    };
  }
  
  return plotOptions;
}

/**
 * Vertical line chart for continuous measure on X and continuous dimension on Y.
 * Sorts by the Y dimension so the line flows bottom-to-top.
 */
export function verticalLineChart(
  data: any[],
  xColumn: string,
  yColumn: string,
  labels?: { x?: string; y?: string },
  domain?: { x?: [number, number]; y?: [number, number] },
  colorField?: Field
): Plot.PlotOptions {
  const clean = Array.isArray(data)
    ? data.filter((d) => Number.isFinite(d[xColumn]))
    : [];

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, grid: true },
      y: { label: labels?.y || yColumn, grid: true },
      marks: [],
    };
  }

  const toComparable = (v: any): number | string | null => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const num = Number.parseFloat(v);
      if (Number.isFinite(num)) return num;
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
      return v;
    }
    return null;
  };
  const cleanSorted = clean.slice().sort((a, b) => {
    const ay = toComparable(a[yColumn]);
    const by = toComparable(b[yColumn]);
    if (ay == null && by == null) return 0;
    if (ay == null) return 1;
    if (by == null) return -1;
    if (typeof ay === 'string' || typeof by === 'string') return String(ay).localeCompare(String(by));
    return (ay as number) - (by as number);
  });

  const xLabel2 = labels?.x || xColumn;
  const yLabel2 = labels?.y || yColumn;
  const lineConfig: any = { x: xColumn, y: yColumn };
  const dotConfig: any = {
    x: { value: xColumn, label: xLabel2 },
    y: { value: yColumn, label: yLabel2 },
    r: 2,
    channels: {
      [xLabel2]: { value: xColumn, label: xLabel2 },
      [yLabel2]: { value: yColumn, label: yLabel2 }
    },
    tip: { pointer: 'x', preferredAnchor: 'top-right', format: { [xLabel2]: true, [yLabel2]: true, x: false, y: false, fill: false, r: false } }
  };
  
  if (colorField) {
    // Add color encoding and z channel for grouping by color
    const colorColumnName = getResultColumnName(colorField);
    lineConfig.stroke = colorColumnName;
    lineConfig.z = colorColumnName;
    dotConfig.fill = colorColumnName;
  } else {
    lineConfig.stroke = DEFAULT_CHART_COLOR;
    dotConfig.fill = DEFAULT_CHART_COLOR;
  }
  
  const plotOptions: Plot.PlotOptions = {
    x: { label: labels?.x || xColumn, grid: true, domain: domain?.x },
    y: { label: labels?.y || yColumn, grid: true, domain: domain?.y },
    marks: [
      Plot.line(cleanSorted, lineConfig),
      Plot.dot(cleanSorted, dotConfig),
    ],
  };
  
  if (colorField) {
    // Get unique color values for the domain
    const colorColumnName = getResultColumnName(colorField);
    const colorValues = Array.from(new Set(cleanSorted.map(row => row[colorColumnName])));
    plotOptions.color = {
      domain: colorValues,
      scheme: DEFAULT_COLOR_SCHEME,
      type: 'ordinal' as any
    };
  }
  
  return plotOptions;
}


