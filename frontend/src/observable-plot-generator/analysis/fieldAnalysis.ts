// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
export interface FieldAnalysis {
  hasMeasure: boolean;
  hasXMeasure: boolean;
  hasYMeasure: boolean;
  hasXDimension: boolean;
  hasYDimension: boolean;
  xMeasures: any[];
  yMeasures: any[];
  xDimensions: any[];
  yDimensions: any[];
  totalMeasures: number;
  /**
   * @deprecated Use isMultiContinuousOnSameAxis instead
   * True when multiple measures are on the SAME axis (not both axes).
   */
  isMultiMeasure: boolean;
  /**
   * True when 2+ continuous fields (measures OR dimensions) are on the SAME axis with nothing continuous on the opposite axis.
   * Used to trigger stacked bar/tick strip grid layouts.
   * Examples:
   * - X: [measure1, measure2], Y: [] → true (stacked bars)
   * - X: [dim1, dim2], Y: [] → true (stacked tick strips)
   * - X: [measure1, dim1], Y: [] → true (stacked bar + tick strip)
   * - X: [measure1], Y: [measure2] → false (cartesian grid, not stacked)
   */
  isMultiContinuousOnSameAxis: boolean;
  hasMixedAxes: boolean; // Measures on both X and Y axes
}

export function analyzeFields(xFields: any[], yFields: any[]): FieldAnalysis {
  const xMeasures = xFields.filter((f: any) => f.type === 'measure');
  const yMeasures = yFields.filter((f: any) => f.type === 'measure');
  const xDimensions = xFields.filter((f: any) => f.type === 'dimension');
  const yDimensions = yFields.filter((f: any) => f.type === 'dimension');

  const totalMeasures = xMeasures.length + yMeasures.length;
  
  // Count continuous fields on each axis
  const xContinuousMeasures = xMeasures.filter((m: any) => m.flavour === 'continuous');
  const yContinuousMeasures = yMeasures.filter((m: any) => m.flavour === 'continuous');
  const xContinuousDimensions = xDimensions.filter((d: any) => d.flavour === 'continuous');
  const yContinuousDimensions = yDimensions.filter((d: any) => d.flavour === 'continuous');
  
  const xContinuousCount = xContinuousMeasures.length + xContinuousDimensions.length;
  const yContinuousCount = yContinuousMeasures.length + yContinuousDimensions.length;
  
  // isMultiMeasure (deprecated): 2+ measures on SAME axis, NOT on both axes
  const isMultiMeasure = 
    (xMeasures.length > 1 && yMeasures.length === 0) ||
    (yMeasures.length > 1 && xMeasures.length === 0);
  
  // isMultiContinuousOnSameAxis: 2+ continuous fields (measures OR dimensions) on SAME axis with nothing continuous on opposite axis
  const isMultiContinuousOnSameAxis =
    (xContinuousCount > 1 && yContinuousCount === 0) ||
    (yContinuousCount > 1 && xContinuousCount === 0);

  return {
    hasMeasure: totalMeasures > 0,
    hasXMeasure: xMeasures.length > 0,
    hasYMeasure: yMeasures.length > 0,
    hasXDimension: xDimensions.length > 0,
    hasYDimension: yDimensions.length > 0,
    xMeasures,
    yMeasures,
    xDimensions,
    yDimensions,
    totalMeasures,
    isMultiMeasure,
    isMultiContinuousOnSameAxis,
    hasMixedAxes: xMeasures.length > 0 && yMeasures.length > 0,
  };
}


