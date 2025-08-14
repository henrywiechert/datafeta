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
  isMultiMeasure: boolean;
  hasMixedAxes: boolean; // Measures on both X and Y axes
}

export function analyzeFields(xFields: any[], yFields: any[]): FieldAnalysis {
  const xMeasures = xFields.filter((f: any) => f.type === 'measure');
  const yMeasures = yFields.filter((f: any) => f.type === 'measure');
  const xDimensions = xFields.filter((f: any) => f.type === 'dimension');
  const yDimensions = yFields.filter((f: any) => f.type === 'dimension');

  const totalMeasures = xMeasures.length + yMeasures.length;

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
    isMultiMeasure: totalMeasures > 1,
    hasMixedAxes: xMeasures.length > 0 && yMeasures.length > 0,
  };
}


