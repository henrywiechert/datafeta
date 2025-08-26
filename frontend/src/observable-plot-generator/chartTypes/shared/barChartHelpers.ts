import * as Plot from '@observablehq/plot';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../../../config/chartLayoutConfig';
import { getResultColumnName } from '../../../utils/fieldUtils';

/**
 * Shared utilities for bar chart creation
 */

// Compute numeric extent for a column, ignoring non-finite values
export function numericExtent(rows: any[], column: string): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = row[column];
    if (typeof v === 'number' && isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (min === Infinity || max === -Infinity) return [0, 0];
  return [min, max];
}

// Build a domain that always starts at 0 and pads the max by 5%
export function paddedDomainIncludingZero(minVal: number, maxVal: number): [number, number] {
  // Upper bound is the positive max (or 0), padded by 5%
  const upperRaw = Math.max(0, maxVal);
  const upper = upperRaw === 0 ? 1 : upperRaw * 1.05;
  return [0, upper];
}

/**
 * Calculate shared domains across all measures
 */
export function calculateSharedDomains(measures: any[], data: any[]) {
  const domains: any = {};

  // For each measure, calculate its domain
  measures.forEach(measure => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    
    const values = data.map(row => row[measureName]).filter(v => typeof v === 'number' && isFinite(v));
    if (values.length > 0) {
      const max = Math.max(0, ...values);
      const upper = max === 0 ? 1 : max * 1.05; // +5% headroom
      domains[measureName] = [0, upper];
    }
  });

  return domains;
}

/**
 * Create horizontal bar chart (measure on X-axis)
 */
export function createHorizontalBarChart(
  measureName: string,
  dimension: any,
  data: any[],
  sharedDomains?: any,
  barStep: number = BAR_STEP_PX
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    x: {
      domain: sharedDomains?.[measureName] || (() => {
        const [minVal, maxVal] = numericExtent(data, measureName);
        return paddedDomainIncludingZero(minVal, maxVal);
      })(),
      grid: true,
      label: measureName,
      nice: false,
    },
    marks: [Plot.ruleX([0])],
  };

  if (dimension) {
    // Horizontal bars with dimension on Y-axis
    const categories = Array.from(new Set(data.map((row) => row[dimension.columnName])));
    const categoryCount = categories.length;
    plotOptions.height = Math.max(barStep * 2, categoryCount * barStep);
    plotOptions.y = { label: dimension.columnName, domain: categories as any, type: 'band' as any };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        y: dimension.columnName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  } else {
    // Single horizontal bar
    plotOptions.height = barStep * 2;
    plotOptions.y = { label: ' ', domain: [' '] as any, type: 'band' as any };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  }

  return plotOptions;
}

/**
 * Create vertical bar chart (measure on Y-axis)
 */
export function createVerticalBarChart(
  measureName: string,
  dimension: any,
  data: any[],
  sharedDomains?: any,
  barStep: number = BAR_STEP_PX
): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    y: {
      domain: sharedDomains?.[measureName] || (() => {
        const [minVal, maxVal] = numericExtent(data, measureName);
        return paddedDomainIncludingZero(minVal, maxVal);
      })(),
      grid: true,
      label: measureName,
      nice: false,
    },
    marks: [Plot.ruleY([0])],
  };

  if (dimension) {
    // Vertical bars with dimension on X-axis
    const categories = Array.from(new Set(data.map((row) => row[dimension.columnName])));
    const categoryCount = categories.length;
    plotOptions.width = Math.max(barStep * 2, categoryCount * barStep);
    plotOptions.x = { label: dimension.columnName, domain: categories as any, type: 'band' as any };
    plotOptions.marks!.push(
      Plot.barY(data, {
        x: dimension.columnName,
        y: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  } else {
    // Single vertical bar
    plotOptions.width = barStep * 2;
    plotOptions.x = { label: ' ', domain: [' '] as any, type: 'band' as any };
    plotOptions.marks!.push(
      Plot.barY(data, {
        y: measureName,
        fill: DEFAULT_CHART_COLOR,
      })
    );
  }

  return plotOptions;
}