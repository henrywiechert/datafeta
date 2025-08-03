import * as Plot from '@observablehq/plot';
import { FacetingLayer, FacetingContext, FacetedResult, ChartSpec, FacetingPipeline } from '../facetingPipeline';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { ChartSizingCoordinator, ChartSizingContext, detectChartType } from '../utils/chartSizingStrategies';

/**
 * Layer 2: Multi-Measure Faceting
 * 
 * Responsibility:
 * - If multiple measures remain after Layer 1, create multiple charts
 * - One chart per remaining measure, sharing the same dimensions
 * - Consume all remaining measures
 * - Layout strategy for multiple measure charts
 */
export class MultiMeasureLayer implements FacetingLayer {
  name = "Multi-Measure Faceting";

  canApply(context: FacetingContext): boolean {
    const { remainingXFields, remainingYFields } = context;
    
    // Can apply if we have remaining measures after single chart generation
    const remainingMeasures = [...remainingXFields, ...remainingYFields].filter(f => f.type === 'measure');
    return remainingMeasures.length > 0;
  }

  apply(context: FacetingContext): FacetedResult {
    const { remainingXFields, remainingYFields, queryResult } = context;
    
    // Get remaining measures
    const remainingXMeasures = remainingXFields.filter(f => f.type === 'measure');
    const remainingYMeasures = remainingYFields.filter(f => f.type === 'measure');
    
    // Get available dimensions (these will be shared across all measure charts)
    const availableXDimensions = remainingXFields.filter(f => f.type === 'dimension');
    const availableYDimensions = remainingYFields.filter(f => f.type === 'dimension');

    const allCharts: ChartSpec[] = [];
    let usedXFields: Field[] = [];
    let usedYFields: Field[] = [];

    // Create charts for remaining Y-axis measures (vertical bars)
    for (const measure of remainingYMeasures) {
      const chartSpec = this.createMeasureChart(
        measure,
        'y',
        availableXDimensions,
        availableYDimensions,
        queryResult
      );
      allCharts.push(chartSpec);
      usedYFields.push(measure);
    }

    // Create charts for remaining X-axis measures (horizontal bars)  
    for (const measure of remainingXMeasures) {
      const chartSpec = this.createMeasureChart(
        measure,
        'x',
        availableXDimensions,
        availableYDimensions,
        queryResult
      );
      allCharts.push(chartSpec);
      usedXFields.push(measure);
    }

    // If we created multiple charts, adjust their layout
    if (allCharts.length > 1) {
      this.applyMultiChartLayout(allCharts);
    }

    // Consume used measures
    const newContext = FacetingPipeline.consumeFields(context, usedXFields, usedYFields);

    return {
      charts: allCharts,
      finalContext: newContext
    };
  }

  private createMeasureChart(
    measure: Field,
    measureAxis: 'x' | 'y',
    availableXDimensions: Field[],
    availableYDimensions: Field[],
    queryResult: any
  ): ChartSpec {
    const data = queryResult.rows;
    const measureName = getResultColumnName(measure);

    // For multi-measure charts, use the best available dimension for categories
    // Take the last dimension (most specific) from the opposite axis
    let categoryDimension: Field | null = null;
    
    if (measureAxis === 'y' && availableXDimensions.length > 0) {
      categoryDimension = availableXDimensions[availableXDimensions.length - 1];
    } else if (measureAxis === 'x' && availableYDimensions.length > 0) {
      categoryDimension = availableYDimensions[availableYDimensions.length - 1];
    }

    let marks: Plot.Markish[];
    let plotOptions: Plot.PlotOptions;

    if (measureAxis === 'y') {
      // Vertical bar chart
      const barConfig: any = {
        y: measureName,
        fill: "steelblue",
      };

      if (categoryDimension) {
        barConfig.x = categoryDimension.columnName;
      }

      marks = [
        Plot.barY(data, barConfig),
        Plot.ruleY([0])
      ];

      plotOptions = {
        title: `${measureName}`, // Title to distinguish charts
        marks,
        x: {
          label: categoryDimension ? categoryDimension.columnName : " ",
        },
        y: {
          grid: true,
          label: measureName,
        },
      };
    } else {
      // Horizontal bar chart
      const barConfig: any = {
        x: measureName,
        fill: "steelblue",
      };

      if (categoryDimension) {
        barConfig.y = categoryDimension.columnName;
      }

      marks = [
        Plot.barX(data, barConfig),
        Plot.ruleX([0])
      ];

      plotOptions = {
        title: `${measureName}`, // Title to distinguish charts
        marks,
        y: {
          label: categoryDimension ? categoryDimension.columnName : " ",
        },
        x: {
          grid: true,
          label: measureName,
        },
      };
    }

    // Apply chart-type-aware sizing
    const chartType = detectChartType(marks);
    const sizingContext: ChartSizingContext = {
      data,
      measureField: measure,
      dimensionField: categoryDimension || undefined,
      chartType,
      orientation: measureAxis === 'y' ? 'vertical' : 'horizontal'
    };

    const sizingRequirements = ChartSizingCoordinator.calculateSizing(sizingContext);
    plotOptions = ChartSizingCoordinator.applySizing(plotOptions, sizingRequirements);

    return {
      plotOptions,
      usedFields: {
        xFields: measureAxis === 'y' ? (categoryDimension ? [categoryDimension] : []) : [measure],
        yFields: measureAxis === 'y' ? [measure] : (categoryDimension ? [categoryDimension] : [])
      }
    };
  }

  private applyMultiChartLayout(charts: ChartSpec[]): void {
    // For multiple measure charts, we can apply layout hints
    // Observable Plot will handle the actual layout, but we can set consistent sizing
    
    charts.forEach((chart, index) => {
      // Add subtle styling differences for multiple charts
      const newStyle: any = {
        backgroundColor: index % 2 === 0 ? "white" : "#fafafa",
      };

      if (chart.plotOptions.style) {
        Object.assign(newStyle, chart.plotOptions.style);
      }
      
      chart.plotOptions.style = newStyle;
      
      // Ensure consistent margins for multi-chart layout
      chart.plotOptions.marginTop = 40; // Space for titles
      chart.plotOptions.marginBottom = 30;
      chart.plotOptions.marginLeft = 60;
      chart.plotOptions.marginRight = 20;
    });
  }
}
