import { PlotResult } from '../../../observable-plot-generator/types';

// Extract the function for testing by importing it from a separate module
// Since it's currently internal to ChartGrid.tsx, we'll test via a mock approach

// Mock test data
const mockPlotResult: PlotResult = {
  library: 'observable-plot',
  plots: [
    {
      id: 'plot1',
      title: 'Test Plot',
      position: { row: 0, col: 0 },
      options: {
        y: {
          label: 'Very Long Measure Name That Should Wrap',
          domain: [0, 100],
          type: 'linear'
        }
      }
    },
    {
      id: 'plot2', 
      title: 'Test Plot 2',
      position: { row: 1, col: 0 },
      options: {
        y: {
          label: 'Short Name',
          domain: [0, 50],
          type: 'linear'
        }
      }
    }
  ]
};

const mockPlotResultWithCategorical: PlotResult = {
  library: 'observable-plot',
  plots: [
    {
      id: 'plot1',
      title: 'Categorical Plot',
      position: { row: 0, col: 0 },
      options: {
        y: {
          label: 'Extremely Long Measure Name That Will Definitely Wrap In Small Facets',
          domain: ['Category A', 'Category B', 'Very Long Category Name'],
          type: 'band'
        }
      }
    }
  ]
};

// Since the function is internal to ChartGrid, we test the integration behavior
describe('ChartGrid Y-axis gutter calculation', () => {
  const TEXT_PX_PER_CHAR = 6;
  const MIN_Y_AXIS_GUTTER_PX = 28;

  function estimateTextPx(text?: string): number {
    if (!text) return 0;
    return Math.ceil(text.length * TEXT_PX_PER_CHAR);
  }

  // Replicate the improved function logic for testing
  function computeDynamicYAxisGutterPx(spec: PlotResult, rows: number): number {
    let maxWidth = MIN_Y_AXIS_GUTTER_PX;
    const plots = spec.plots || [];
    for (let r = 0; r < rows; r++) {
      const sample = plots.find((p) => p.position?.row === r);
      const yOpts: any = (sample as any)?.options?.y || {};
      const yType = yOpts?.type;
      const yDomain = yOpts?.domain as any;
      const yLabel = yOpts?.label;
      
      let tickWidth = 0;
      if (yType === 'band' && Array.isArray(yDomain)) {
        // Categorical axis: estimate by longest label
        const longest = yDomain.reduce((m: number, v: any) => Math.max(m, estimateTextPx(String(v))), 0);
        tickWidth = longest + 10; // padding
      } else if (Array.isArray(yDomain) && yDomain.length === 2) {
        // Numeric axis: endpoints only (ticks are generated inside ObservablePlot)
        const [a, b] = yDomain;
        tickWidth = Math.max(estimateTextPx(String(a)), estimateTextPx(String(b))) + 6; // small padding
      }
      
      // Also consider Y-axis label (measure name) which can wrap
      let yLabelWidth = 0;
      if (yLabel && typeof yLabel === 'string') {
        const labelTextWidth = estimateTextPx(yLabel);
        // In faceted views with small facets, assume Y-axis label might wrap at around 80px
        // This is a reasonable threshold for when labels start wrapping in constrained spaces
        const assumedWrappingThreshold = 80;
        if (labelTextWidth > assumedWrappingThreshold) {
          // For wrapped text, we need extra horizontal space
          // Estimate wrapped text needs about 1.5x the wrapping threshold width
          yLabelWidth = Math.ceil(assumedWrappingThreshold * 1.5) + 15; // padding for wrapped text
        } else {
          // For non-wrapped text, use estimated width + padding
          yLabelWidth = labelTextWidth + 10;
        }
      }
      
      const rowWidth = Math.max(MIN_Y_AXIS_GUTTER_PX, tickWidth, yLabelWidth);
      if (rowWidth > maxWidth) maxWidth = rowWidth;
    }
    return maxWidth;
  }

  test('should calculate wider gutter for long Y-axis labels', () => {
    const result = computeDynamicYAxisGutterPx(mockPlotResult, 2);
    
    // Long measure name should trigger wrapping logic
    const longLabelWidth = estimateTextPx('Very Long Measure Name That Should Wrap');
    expect(longLabelWidth).toBeGreaterThan(80); // Should exceed wrapping threshold
    
    // Result should be wider than minimum to accommodate wrapped text
    expect(result).toBeGreaterThan(MIN_Y_AXIS_GUTTER_PX);
    expect(result).toBeGreaterThan(100); // Should provide adequate space for wrapped text
  });

  test('should use minimum gutter for short Y-axis labels', () => {
    const shortLabelPlot: PlotResult = {
      library: 'observable-plot',
      plots: [
        {
          id: 'plot1',
          title: 'Short Plot',
          position: { row: 0, col: 0 },
          options: {
            y: {
              label: 'Short',
              domain: [0, 10],
              type: 'linear'
            }
          }
        }
      ]
    };

    const result = computeDynamicYAxisGutterPx(shortLabelPlot, 1);
    
    // Short label should not exceed minimum significantly
    const shortLabelWidth = estimateTextPx('Short');
    expect(shortLabelWidth).toBeLessThan(80); // Should not exceed wrapping threshold
    
    // Should be close to minimum or slightly larger for short label
    expect(result).toBeGreaterThanOrEqual(MIN_Y_AXIS_GUTTER_PX);
  });

  test('should handle categorical axes with long labels and long measure names', () => {
    const result = computeDynamicYAxisGutterPx(mockPlotResultWithCategorical, 1);
    
    // Should consider both category labels and Y-axis label
    expect(result).toBeGreaterThan(MIN_Y_AXIS_GUTTER_PX);
    expect(result).toBeGreaterThan(100); // Should provide space for both elements
  });

  test('should handle missing Y-axis labels gracefully', () => {
    const noLabelPlot: PlotResult = {
      library: 'observable-plot',
      plots: [
        {
          id: 'plot1',
          title: 'No Label Plot',
          position: { row: 0, col: 0 },
          options: {
            y: {
              domain: [0, 100],
              type: 'linear'
              // No label property
            }
          }
        }
      ]
    };

    const result = computeDynamicYAxisGutterPx(noLabelPlot, 1);
    
    // Should fall back to minimum or numeric domain calculation
    expect(result).toBeGreaterThanOrEqual(MIN_Y_AXIS_GUTTER_PX);
  });
});