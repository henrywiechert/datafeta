import * as Plot from '@observablehq/plot';
import { FacetingLayer, FacetingContext, FacetedResult, ChartSpec, FacetingPipeline } from '../facetingPipeline';
import { Field } from '../../types';
import { ChartSizingCoordinator, ChartSizingContext, detectChartType } from '../utils/chartSizingStrategies';

/**
 * Layer 3: Discrete Dimension Faceting
 * 
 * Responsibility:
 * - Apply fx/fy faceting to existing charts based on remaining discrete dimensions
 * - X-axis dimensions → horizontal facets (fx)
 * - Y-axis dimensions → vertical facets (fy)
 * - Matrix faceting when dimensions on both axes
 * - Hierarchical faceting for multiple dimensions on same axis
 */
export class DimensionFacetingLayer implements FacetingLayer {
  name = "Discrete Dimension Faceting";

  canApply(context: FacetingContext): boolean {
    const { remainingXFields, remainingYFields } = context;
    
    // Can apply if we have remaining discrete dimensions
    const remainingXDimensions = remainingXFields.filter(f => f.type === 'dimension');
    const remainingYDimensions = remainingYFields.filter(f => f.type === 'dimension');
    
    return remainingXDimensions.length > 0 || remainingYDimensions.length > 0;
  }

  apply(context: FacetingContext): FacetedResult {
    const { remainingXFields, remainingYFields } = context;
    
    // Get remaining dimensions for faceting
    const remainingXDimensions = remainingXFields.filter(f => f.type === 'dimension');
    const remainingYDimensions = remainingYFields.filter(f => f.type === 'dimension');
    
    // Determine faceting configuration
    const facetConfig = this.getFacetConfig(remainingXDimensions, remainingYDimensions);
    
    // Apply faceting to all existing charts
    // Note: We assume charts come from previous layers, but if no charts exist,
    // we might need to create a minimal chart for faceting
    let charts: ChartSpec[] = [];
    
    if (context.consumedFields.xFields.length === 0 && context.consumedFields.yFields.length === 0) {
      // No charts created yet - create a minimal faceted chart
      charts = [this.createMinimalFacetedChart(facetConfig, context)];
    } else {
      // Apply faceting to existing charts (this would come from previous layers)
      // For now, create a basic implementation
      charts = [this.createFacetedChart(facetConfig, context)];
    }

    // Consume all remaining dimensions
    const newContext = FacetingPipeline.consumeFields(
      context, 
      remainingXDimensions, 
      remainingYDimensions
    );

    return {
      charts,
      finalContext: newContext
    };
  }

  private getFacetConfig(xDimensions: Field[], yDimensions: Field[]) {
    const config: any = {};

    // Horizontal faceting (fx) from X-axis dimensions
    if (xDimensions.length > 0) {
      // For hierarchical faceting, use the first dimension
      // TODO: Future enhancement could handle multiple levels
      config.fx = xDimensions[0].columnName;
      config.fxDimension = xDimensions[0];
    }

    // Vertical faceting (fy) from Y-axis dimensions
    if (yDimensions.length > 0) {
      // For hierarchical faceting, use the first dimension
      // TODO: Future enhancement could handle multiple levels  
      config.fy = yDimensions[0].columnName;
      config.fyDimension = yDimensions[0];
    }

    return config;
  }

  private createMinimalFacetedChart(facetConfig: any, context: FacetingContext): ChartSpec {
    // Create a simple visualization when only dimensions are present
    const data = context.queryResult.rows;
    
    const marks: Plot.Markish[] = [];
    
    if (facetConfig.fx && facetConfig.fy) {
      // Matrix faceting - create a simple dot plot or count
      marks.push(
        Plot.dot(data, {
          fx: facetConfig.fx,
          fy: facetConfig.fy,
          fill: "steelblue",
          r: 3
        })
      );
    } else if (facetConfig.fx) {
      // Horizontal faceting only
      marks.push(
        Plot.barY(data, {
          fx: facetConfig.fx,
          y: () => 1, // Count
          fill: "steelblue"
        })
      );
    } else if (facetConfig.fy) {
      // Vertical faceting only
      marks.push(
        Plot.barX(data, {
          fy: facetConfig.fy,
          x: () => 1, // Count
          fill: "steelblue"
        })
      );
    }

    // Apply chart-type-aware sizing
    const chartType = detectChartType(marks);
    const sizingContext: ChartSizingContext = {
      data,
      facetFields: [
        ...(facetConfig.fxDimension ? [facetConfig.fxDimension] : []),
        ...(facetConfig.fyDimension ? [facetConfig.fyDimension] : [])
      ],
      chartType,
      orientation: facetConfig.fx ? 'vertical' : 'horizontal'
    };

    const sizingRequirements = ChartSizingCoordinator.calculateSizing(sizingContext);
    let plotOptions: Plot.PlotOptions = {
      marks,
    };

    plotOptions = ChartSizingCoordinator.applySizing(plotOptions, sizingRequirements);

    // Add facet axis labels
    if (facetConfig.fx) {
      plotOptions.fx = { label: facetConfig.fxDimension.columnName };
    }
    if (facetConfig.fy) {
      plotOptions.fy = { label: facetConfig.fyDimension.columnName };
    }

    return {
      plotOptions,
      usedFields: {
        xFields: facetConfig.fxDimension ? [facetConfig.fxDimension] : [],
        yFields: facetConfig.fyDimension ? [facetConfig.fyDimension] : []
      }
    };
  }

  private createFacetedChart(facetConfig: any, context: FacetingContext): ChartSpec {
    // This would ideally modify existing charts from previous layers
    // For now, create a new chart with faceting applied
    
    const data = context.queryResult.rows;
    
    // Get the first consumed measure to recreate a basic chart with faceting
    const consumedMeasures = [
      ...context.consumedFields.xFields.filter(f => f.type === 'measure'),
      ...context.consumedFields.yFields.filter(f => f.type === 'measure')
    ];
    
    const consumedDimensions = [
      ...context.consumedFields.xFields.filter(f => f.type === 'dimension'),
      ...context.consumedFields.yFields.filter(f => f.type === 'dimension')
    ];

    if (consumedMeasures.length === 0) {
      return this.createMinimalFacetedChart(facetConfig, context);
    }

    const measure = consumedMeasures[0];
    const measureName = measure.columnName; // Simplified for now
    const categoryDimension = consumedDimensions[0] || null;

    // Determine chart orientation based on measure placement
    const isMeasureOnY = context.consumedFields.yFields.includes(measure);

    const barConfig: any = {
      fill: "steelblue",
      ...facetConfig // Add fx/fy faceting
    };

    let marks: Plot.Markish[];
    let plotOptions: Plot.PlotOptions;

    if (isMeasureOnY) {
      // Vertical bars with faceting
      barConfig.y = measureName;
      if (categoryDimension) {
        barConfig.x = categoryDimension.columnName;
      }

      marks = [
        Plot.barY(data, barConfig),
        Plot.ruleY([0])
      ];

      plotOptions = {
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
      // Horizontal bars with faceting
      barConfig.x = measureName;
      if (categoryDimension) {
        barConfig.y = categoryDimension.columnName;
      }

      marks = [
        Plot.barX(data, barConfig),
        Plot.ruleX([0])
      ];

      plotOptions = {
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
      facetFields: [
        ...(facetConfig.fxDimension ? [facetConfig.fxDimension] : []),
        ...(facetConfig.fyDimension ? [facetConfig.fyDimension] : [])
      ],
      chartType,
      orientation: isMeasureOnY ? 'vertical' : 'horizontal'
    };

    const sizingRequirements = ChartSizingCoordinator.calculateSizing(sizingContext);
    plotOptions = ChartSizingCoordinator.applySizing(plotOptions, sizingRequirements);

    // Add facet axis labels
    if (facetConfig.fx) {
      plotOptions.fx = { label: facetConfig.fxDimension.columnName };
    }
    if (facetConfig.fy) {
      plotOptions.fy = { label: facetConfig.fyDimension.columnName };
    }

    return {
      plotOptions,
      usedFields: {
        xFields: [
          ...(facetConfig.fxDimension ? [facetConfig.fxDimension] : []),
          ...(categoryDimension && !isMeasureOnY ? [categoryDimension] : []),
          ...(!isMeasureOnY ? [measure] : [])
        ],
        yFields: [
          ...(facetConfig.fyDimension ? [facetConfig.fyDimension] : []),
          ...(categoryDimension && isMeasureOnY ? [categoryDimension] : []),
          ...(isMeasureOnY ? [measure] : [])
        ]
      }
    };
  }
}