import * as Plot from '@observablehq/plot';
import { FacetingLayer, FacetingContext, FacetedResult, ChartSpec, FacetingPipeline } from '../facetingPipeline';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';
import { ChartSizingCoordinator, ChartSizingContext, detectChartType } from '../utils/chartSizingStrategies';
import { createFacetConfiguration, createMeasureFacetField, applyFacetConfiguration, addFacetingToMark } from '../utils/facetingUtils';

/**
 * Layer 2: Multi-Measure Faceting
 * 
 * Responsibility:
 * - If multiple measures remain after Layer 1, apply consistent faceting rules:
 *   - X-axis measures → horizontal faceting (fx) - side by side
 *   - Y-axis measures → vertical faceting (fy) - stacked vertically
 * - Create single faceted chart instead of multiple separate charts
 * - Consume all remaining measures
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
    
    console.log(`🔢 MultiMeasureLayer processing: X measures: ${remainingXMeasures.length}, Y measures: ${remainingYMeasures.length}`);
    console.log(`📊 X measures: [${remainingXMeasures.map(m => m.columnName).join(', ')}]`);
    console.log(`📊 Y measures: [${remainingYMeasures.map(m => m.columnName).join(', ')}]`);
    
    // Get available dimensions (these will be shared across all measure charts)
    const availableXDimensions = remainingXFields.filter(f => f.type === 'dimension');
    const availableYDimensions = remainingYFields.filter(f => f.type === 'dimension');

    // Apply consistent faceting rules:
    // - X-axis measures → horizontal faceting (fx) 
    // - Y-axis measures → vertical faceting (fy)
    const facetingFields: { xFields: Field[], yFields: Field[] } = { xFields: [], yFields: [] };
    
    if (remainingXMeasures.length > 1) {
      // Multiple X-axis measures → horizontal faceting
      console.log(`✅ Triggering horizontal faceting for ${remainingXMeasures.length} X-axis measures`);
      facetingFields.xFields = remainingXMeasures;
    }
    
    if (remainingYMeasures.length > 1) {
      // Multiple Y-axis measures → vertical faceting  
      console.log(`✅ Triggering vertical faceting for ${remainingYMeasures.length} Y-axis measures`);
      facetingFields.yFields = remainingYMeasures;
    }
    
    // Also handle single measures that need to be shown (when no faceting is applied)
    if (remainingXMeasures.length === 1 && remainingYMeasures.length === 0) {
      console.log(`📊 Single X-axis measure: ${remainingXMeasures[0].columnName}`);
    }
    
    if (remainingYMeasures.length === 1 && remainingXMeasures.length === 0) {
      console.log(`📊 Single Y-axis measure: ${remainingYMeasures[0].columnName}`);
    }

    // Create the faceted chart using the unified approach
    const chart = this.createUnifiedFacetedChart(
      remainingXMeasures,
      remainingYMeasures,
      availableXDimensions,
      availableYDimensions,
      facetingFields,
      queryResult
    );

    // Consume all remaining measures
    const newContext = FacetingPipeline.consumeFields(
      context, 
      remainingXMeasures, 
      remainingYMeasures
    );

    return {
      charts: [chart],
      finalContext: newContext
    };
  }

  private createUnifiedFacetedChart(
    xMeasures: Field[],
    yMeasures: Field[],
    availableXDimensions: Field[],
    availableYDimensions: Field[],
    facetingFields: { xFields: Field[], yFields: Field[] },
    queryResult: any
  ): ChartSpec {
    const data = queryResult.rows;

    // Determine the primary chart type based on available measures
    const primaryMeasure = xMeasures[0] || yMeasures[0];
    const isVerticalChart = yMeasures.length > 0;
    const totalMeasures = xMeasures.length + yMeasures.length;
    const isCurrentlyMeasureFaceting = totalMeasures > 1;
    
    // Get the best available dimension for categories. If none, create a dummy one.
    let categoryDimension: Field | null = null;
    let isDummyDimension = false;
    if (isVerticalChart) {
      categoryDimension = availableXDimensions[0] || null;
    } else {
      categoryDimension = availableYDimensions[0] || null;
    }

    if (!categoryDimension) {
      isDummyDimension = true;
      const dummyDimensionName = isVerticalChart ? '_dummyX' : '_dummyY';
      categoryDimension = { id: 'dummy', columnName: dummyDimensionName, type: 'dimension', dataType: 'string', flavour: 'discrete' };
      // Inject dummy dimension into every data row
      queryResult.rows.forEach((row: any) => row[dummyDimensionName] = ' ');
      console.log(`- Created dummy dimension '${dummyDimensionName}' to control bar thickness.`);
    }

    // Create facet configuration using the unified approach
    const facetConfig = createFacetConfiguration(
      facetingFields.xFields, 
      facetingFields.yFields, 
      'measures'
    );

    // Transform data for measure faceting if needed
    const transformedData = this.transformDataForMeasureFaceting(
      data, 
      xMeasures, 
      yMeasures, 
      facetConfig
    );

    // Create the base chart configuration
    let marks: Plot.Markish[];
    let plotOptions: Plot.PlotOptions;

    if (isVerticalChart) {
      // Vertical bar chart(s)
      const barConfig: any = {
        y: this.getMeasureValueForFaceting(yMeasures, facetConfig),
        fill: "steelblue",
      };

      if (categoryDimension) {
        barConfig.x = categoryDimension.columnName;
      }
      
      // For measure faceting OR when using a dummy dimension, use inset to control thickness
      if (isCurrentlyMeasureFaceting || isDummyDimension) {
        barConfig.inset = 0.6;
        console.log(`- Applying inset (0.6) for bar thickness control.`);
      }

      // Add faceting to the mark
      const facetedBarConfig = addFacetingToMark(barConfig, facetConfig);

      marks = [
        Plot.barY(transformedData, facetedBarConfig),
        Plot.ruleY([0])
      ];

      plotOptions = {
        marks,
        x: {
          label: isDummyDimension ? null : (categoryDimension ? categoryDimension.columnName : " "),
          // Hide ticks and domain line for dummy dimension
          ...(isDummyDimension && { tickSize: 0, line: false }),
        },
        y: {
          grid: true,
          label: yMeasures.length === 1 ? getResultColumnName(yMeasures[0]) : "Value",
        },
      };
    } else {
      // Horizontal bar chart(s)
      const barConfig: any = {
        x: this.getMeasureValueForFaceting(xMeasures, facetConfig),
        fill: "steelblue",
      };

      if (categoryDimension) {
        barConfig.y = categoryDimension.columnName;
      }

      // For measure faceting OR when using a dummy dimension, use inset to control thickness
      if (isCurrentlyMeasureFaceting || isDummyDimension) {
        barConfig.inset = 0.6;
        console.log(`- Applying inset (0.6) for bar thickness control.`);
      }

      // Add faceting to the mark
      const facetedBarConfig = addFacetingToMark(barConfig, facetConfig);

      marks = [
        Plot.barX(transformedData, facetedBarConfig),
        Plot.ruleX([0])
      ];

      plotOptions = {
        marks,
        y: {
          label: isDummyDimension ? null : (categoryDimension ? categoryDimension.columnName : " "),
          // Hide ticks and domain line for dummy dimension
          ...(isDummyDimension && { tickSize: 0, line: false }),
        },
        x: {
          grid: true,
          label: xMeasures.length === 1 ? getResultColumnName(xMeasures[0]) : "Value",
        },
      };
    }

    // Apply facet configuration to plot options
    plotOptions = applyFacetConfiguration(plotOptions, facetConfig);
    
    console.log(`🎨 Final bar configuration for measure faceting:`);
    console.log(`  - Bar inset: ${isCurrentlyMeasureFaceting ? '0.6' : 'none'}`);
    console.log(`  - Scale padding: ${isCurrentlyMeasureFaceting ? '0.3' : '0.1'}`);
    console.log(`  - Faceting: fx=${facetConfig.fx || 'none'}, fy=${facetConfig.fy || 'none'}`);
    console.log(`  - Chart orientation: ${isVerticalChart ? 'vertical' : 'horizontal'}`);

    // Apply chart-type-aware sizing
    const chartType = detectChartType(marks);
    
    const sizingContext: ChartSizingContext = {
      data: transformedData,
      measureField: primaryMeasure,
      dimensionField: categoryDimension || undefined,
      facetFields: [
        ...(facetConfig.fxField ? [facetConfig.fxField] : []),
        ...(facetConfig.fyField ? [facetConfig.fyField] : [])
      ],
      chartType,
      orientation: isVerticalChart ? 'vertical' : 'horizontal',
      // Enhanced context for measure faceting
      isMeasureFaceting: isCurrentlyMeasureFaceting,
      originalData: isCurrentlyMeasureFaceting ? data : undefined,
      measureCount: totalMeasures
    };
    
    console.log(`📏 Sizing context: isMeasureFaceting=${isCurrentlyMeasureFaceting}, totalMeasures=${totalMeasures}, hasOriginalData=${!!data}`);
    console.log(`📊 Category dimension: ${categoryDimension ? categoryDimension.columnName : 'none'}`);
    console.log(`🎯 Chart orientation: ${isVerticalChart ? 'vertical' : 'horizontal'}`);
    console.log(`📋 Original data rows: ${data.length}, transformed data rows: ${transformedData.length}`);

    const sizingRequirements = ChartSizingCoordinator.calculateSizing(sizingContext);
    plotOptions = ChartSizingCoordinator.applySizing(plotOptions, sizingRequirements);

    return {
      plotOptions,
      usedFields: {
        xFields: [
          ...xMeasures,
          ...(categoryDimension && isVerticalChart ? [categoryDimension] : []),
          ...(facetConfig.fxField ? [facetConfig.fxField] : [])
        ],
        yFields: [
          ...yMeasures,
          ...(categoryDimension && !isVerticalChart ? [categoryDimension] : []),
          ...(facetConfig.fyField ? [facetConfig.fyField] : [])
        ]
      }
    };
  }

  /**
   * Transform data to support measure faceting.
   * For multiple measures, we need to create a long-form dataset where each measure 
   * becomes a separate row with a measure name column for faceting.
   */
  private transformDataForMeasureFaceting(
    data: any[], 
    xMeasures: Field[], 
    yMeasures: Field[], 
    facetConfig: any
  ): any[] {
    // If no faceting needed (single measure), return original data
    if (xMeasures.length <= 1 && yMeasures.length <= 1) {
      console.log(`📋 No data transformation needed - single measure scenario`);
      return data;
    }

    const transformedData: any[] = [];
    
    // Transform data for multiple measures into long format
    data.forEach(row => {
      if (xMeasures.length > 1 && facetConfig.fx) {
        // Multiple X measures → create rows for horizontal faceting
        console.log(`🔄 Transforming data for ${xMeasures.length} X measures with facet field: ${facetConfig.fx}`);
        xMeasures.forEach(measure => {
          const measureName = getResultColumnName(measure);
          const measureValue = row[measureName];
          
          const newRow = { 
            ...row, 
            [facetConfig.fx]: measureName, // Use measure name as facet value
            _measure_value: measureValue
          };
          transformedData.push(newRow);
        });
      } else if (yMeasures.length > 1 && facetConfig.fy) {
        // Multiple Y measures → create rows for vertical faceting
        console.log(`🔄 Transforming data for ${yMeasures.length} Y measures with facet field: ${facetConfig.fy}`);
        yMeasures.forEach(measure => {
          const measureName = getResultColumnName(measure);
          const measureValue = row[measureName];
          
          const newRow = { 
            ...row, 
            [facetConfig.fy]: measureName, // Use measure name as facet value
            _measure_value: measureValue
          };
          transformedData.push(newRow);
        });
      } else {
        // Single measure, keep original row
        transformedData.push(row);
      }
    });

    console.log(`📊 Data transformation complete: ${data.length} → ${transformedData.length} rows`);
    return transformedData;
  }

  /**
   * Get the correct field name for measure values when faceting.
   * When multiple measures are faceted, we use a synthetic '_measure_value' field.
   * Otherwise, use the original measure field name.
   */
  private getMeasureValueForFaceting(measures: Field[], facetConfig: any): string {
    if (measures.length > 1) {
      // Multiple measures → use synthetic value field
      return '_measure_value';
    } else {
      // Single measure → use original field name
      return getResultColumnName(measures[0]);
    }
  }
}
