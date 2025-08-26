/**
 * Test for unified bar chart implementation to ensure single bar charts 
 * are treated as 1x1 grid charts and code duplication is eliminated.
 */

import { barChart } from './barChart';
import { multiMeasureBarChart } from './multiMeasureBarChart';
import { calculateSharedDomains, numericExtent, paddedDomainIncludingZero } from './shared/barChartHelpers';

// Mock Observable Plot since Jest has issues with ES modules
jest.mock('@observablehq/plot', () => ({
  barX: jest.fn().mockReturnValue({ type: 'barX' }),
  barY: jest.fn().mockReturnValue({ type: 'barY' }),
  ruleX: jest.fn().mockReturnValue({ type: 'ruleX' }),
  ruleY: jest.fn().mockReturnValue({ type: 'ruleY' }),
}));

describe('Unified Bar Chart Implementation', () => {
  const mockQueryResult = {
    rows: [
      { category: 'A', 'SUM(amount)': 250.0 },
      { category: 'B', 'SUM(amount)': 500.0 },
      { category: 'C', 'SUM(amount)': 50.0 },
    ],
    row_count: 3
  };

  const mockSingleMeasureContext = {
    xFields: [{ type: 'dimension', columnName: 'category', flavour: 'discrete' }],
    yFields: [{ type: 'measure', columnName: 'amount', aggregation: 'sum' }],
    queryResult: mockQueryResult
  };

  const mockMultiMeasureContext = {
    xFields: [{ type: 'dimension', columnName: 'category', flavour: 'discrete' }],
    yFields: [
      { type: 'measure', columnName: 'amount', aggregation: 'sum' },
      { type: 'measure', columnName: 'revenue', aggregation: 'sum' }
    ],
    queryResult: {
      rows: [
        { category: 'A', 'SUM(amount)': 250.0, 'SUM(revenue)': 1000.0 },
        { category: 'B', 'SUM(amount)': 500.0, 'SUM(revenue)': 2000.0 },
        { category: 'C', 'SUM(amount)': 50.0, 'SUM(revenue)': 200.0 },
      ],
      row_count: 3
    }
  };

  describe('Single Bar Chart as 1x1 Grid', () => {
    test('should return PlotResult with 1x1 grid layout for single measure', () => {
      const result = barChart(mockSingleMeasureContext as any);
      
      expect(result.library).toBe('observable-plot');
      expect(result.plots).toHaveLength(1);
      expect(result.layout).toEqual({
        type: 'grid',
        columns: 1,
        rows: 1,
        columnSizes: ['fr'],
        rowSizes: ['fr'],
      });
      
      const singlePlot = result.plots![0];
      expect(singlePlot.id).toBe('single-bar');
      expect(singlePlot.title).toBe('SUM(amount)');
      expect(singlePlot.position).toEqual({ row: 0, col: 0 });
      expect(singlePlot.options).toBeDefined();
    });

    test('should handle horizontal bar chart correctly', () => {
      const horizontalContext = {
        xFields: [{ type: 'measure', columnName: 'amount', aggregation: 'sum' }],
        yFields: [{ type: 'dimension', columnName: 'category', flavour: 'discrete' }],
        queryResult: mockQueryResult
      };

      const result = barChart(horizontalContext as any);
      
      expect(result.library).toBe('observable-plot');
      expect(result.plots).toHaveLength(1);
      expect(result.layout!.type).toBe('grid');
      
      const singlePlot = result.plots![0];
      expect(singlePlot.title).toBe('SUM(amount)');
      expect(singlePlot.options.x).toBeDefined();
      expect(singlePlot.options.y).toBeDefined();
    });
  });

  describe('Shared Utilities', () => {
    test('calculateSharedDomains should work consistently', () => {
      const measures = [
        { type: 'measure', columnName: 'amount', aggregation: 'sum' },
        { type: 'measure', columnName: 'revenue', aggregation: 'sum' }
      ];
      
      const data = [
        { 'SUM(amount)': 250.0, 'SUM(revenue)': 1000.0 },
        { 'SUM(amount)': 500.0, 'SUM(revenue)': 2000.0 },
      ];

      const domains = calculateSharedDomains(measures, data);
      
      expect(domains['SUM(amount)']).toEqual([0, 525]); // 500 * 1.05
      expect(domains['SUM(revenue)']).toEqual([0, 2100]); // 2000 * 1.05
    });

    test('numericExtent should calculate correct min/max', () => {
      const data = [
        { value: 10 },
        { value: 25 },
        { value: 5 },
        { value: 'invalid' }, // Should be ignored
        { value: NaN }, // Should be ignored
      ];

      const [min, max] = numericExtent(data, 'value');
      expect(min).toBe(5);
      expect(max).toBe(25);
    });

    test('paddedDomainIncludingZero should include zero and add padding', () => {
      const [d0, d1] = paddedDomainIncludingZero(10, 100);
      expect(d0).toBe(0);
      expect(d1).toBe(105); // 100 * 1.05
    });

    test('paddedDomainIncludingZero should handle zero max', () => {
      const [d0, d1] = paddedDomainIncludingZero(-5, 0);
      expect(d0).toBe(0);
      expect(d1).toBe(1); // fallback to 1 when max is 0
    });
  });

  describe('Multi-Measure Bar Chart Integration', () => {
    test('should use shared utilities for multi-measure charts', () => {
      const result = multiMeasureBarChart(mockMultiMeasureContext as any);
      
      expect(result.library).toBe('observable-plot');
      expect(result.plots).toHaveLength(2); // Two measures
      expect(result.layout!.type).toBe('grid');
      expect(result.layout!.columns).toBe(1);
      expect(result.layout!.rows).toBe(2);
      expect(result.sharedDomains).toBeDefined();
    });
  });

  describe('No Code Duplication', () => {
    test('single and multi measure charts should produce similar plot options for same measure', () => {
      // Get single bar chart result
      const singleResult = barChart(mockSingleMeasureContext as any);
      const singlePlotOptions = singleResult.plots![0].options;

      // Get multi bar chart result and extract first plot
      const multiResult = multiMeasureBarChart(mockMultiMeasureContext as any);
      const multiPlotOptions = multiResult.plots![0].options;

      // Both should have similar structure for the same measure
      expect(singlePlotOptions.y?.label).toBe(multiPlotOptions.y?.label);
      expect(singlePlotOptions.x?.label).toBe(multiPlotOptions.x?.label);
      expect(singlePlotOptions.marks?.length).toBe(multiPlotOptions.marks?.length);
    });
  });
});