import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from '../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Generate multiple bar charts with shared axes for multiple measures
 */
export function multiMeasureBarChart(context: ChartGenerationContext): PlotResult {
  const { queryResult, xFields, yFields } = context;
  const data = queryResult.rows;

  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xDimensions = xFields.filter(f => f.type === 'dimension');
  const yDimensions = yFields.filter(f => f.type === 'dimension');

  // Determine if we have multiple measures
  const allMeasures = [...xMeasures, ...yMeasures];
  if (allMeasures.length <= 1) {
    // Fall back to single chart - not multi-measure
    throw new Error('Multi-measure chart requires multiple measures');
  }

  // Check for mixed axes - this should be handled by scatter plot instead
  if (xMeasures.length > 0 && yMeasures.length > 0) {
    throw new Error('Mixed-axis measures should be handled by scatter plot');
  }

  // Calculate shared domains for all measures
  const sharedDomains = calculateSharedDomains(allMeasures, data);
  
  // Determine layout based on where measures are placed
  const layoutType = xMeasures.length > 0 ? 'horizontal' : 'vertical';
  
  // Generate individual plots for each measure
  const plots = generateMeasurePlots(xMeasures, yMeasures, xDimensions, yDimensions, data, sharedDomains);

  return {
    library: 'observable-plot',
    plots,
    sharedDomains,
    layout: {
      type: layoutType === 'horizontal' ? 'horizontal' : 'vertical',
      columns: layoutType === 'horizontal' ? plots.length : 1, // Horizontal: side by side, Vertical: stacked
      rows: layoutType === 'horizontal' ? 1 : plots.length
    }
  };
}

/**
 * Calculate shared domains across all measures
 */
function calculateSharedDomains(measures: any[], data: any[]) {
  const domains: any = {};

  // For each measure, calculate its domain
  measures.forEach(measure => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    
    const values = data.map(row => row[measureName]).filter(v => v != null);
    if (values.length > 0) {
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      // For measures, typically start at 0 for better comparison
      domains[measureName] = [
        Math.min(0, min), // Include 0 or go below if needed
        max * 1.1 // Add 10% padding at top
      ];
    }
  });

  return domains;
}

/**
 * Generate individual plot for each measure based on axis placement
 */
function generateMeasurePlots(
  xMeasures: any[], 
  yMeasures: any[],
  xDimensions: any[], 
  yDimensions: any[], 
  data: any[], 
  sharedDomains: any
): Array<{id: string; title: string; options: Plot.PlotOptions}> {
  const plots: Array<{id: string; title: string; options: Plot.PlotOptions}> = [];

  // Process X-axis measures (horizontal bar charts)
  xMeasures.forEach((measure, index) => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    const dimension = yDimensions[0]; // Y dimension for horizontal bars
    
    const plotOptions = createHorizontalBarChart(measureName, dimension, data, sharedDomains);
    plots.push({
      id: `x-measure-${index}`,
      title: measureName,
      options: plotOptions
    });
  });

  // Process Y-axis measures (vertical bar charts)
  yMeasures.forEach((measure, index) => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName);
    const dimension = xDimensions[0]; // X dimension for vertical bars
    
    const plotOptions = createVerticalBarChart(measureName, dimension, data, sharedDomains);
    plots.push({
      id: `y-measure-${index}`,
      title: measureName,
      options: plotOptions
    });
  });

  return plots;
}

/**
 * Create horizontal bar chart (measure on X-axis)
 */
function createHorizontalBarChart(measureName: string, dimension: any, data: any[], sharedDomains: any): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    width: 320,
    height: 240,
    x: {
      domain: sharedDomains[measureName], // Shared X domain
      grid: true,
      label: measureName,
    },
    marks: [
      Plot.ruleX([0])
    ]
  };

  if (dimension) {
    // Horizontal bars with dimension on Y-axis
    plotOptions.y = { label: dimension.columnName };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        y: dimension.columnName,
        fill: "steelblue"
      })
    );
  } else {
    // Single horizontal bar
    plotOptions.y = { label: " " };
    plotOptions.marks!.push(
      Plot.barX(data, {
        x: measureName,
        fill: "steelblue"
      })
    );
  }

  return plotOptions;
}

/**
 * Create vertical bar chart (measure on Y-axis)
 */
function createVerticalBarChart(measureName: string, dimension: any, data: any[], sharedDomains: any): Plot.PlotOptions {
  const plotOptions: Plot.PlotOptions = {
    width: 320,
    height: 240,
    y: {
      domain: sharedDomains[measureName], // Shared Y domain
      grid: true,
      label: measureName,
    },
    marks: [
      Plot.ruleY([0])
    ]
  };

  if (dimension) {
    // Vertical bars with dimension on X-axis
    plotOptions.x = { label: dimension.columnName };
    plotOptions.marks!.push(
      Plot.barY(data, {
        x: dimension.columnName,
        y: measureName,
        fill: "steelblue"
      })
    );
  } else {
    // Single vertical bar
    plotOptions.x = { label: " " };
    plotOptions.marks!.push(
      Plot.barY(data, {
        y: measureName,
        fill: "steelblue"
      })
    );
  }

  return plotOptions;
}
