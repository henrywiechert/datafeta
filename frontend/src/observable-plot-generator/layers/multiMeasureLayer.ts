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

    // Consume all remaining measures and record synthetic facet fields so downstream layers
    // can detect which facet axes are already occupied by measure faceting
    const measureFacetConfig = createFacetConfiguration(
      facetingFields.xFields,
      facetingFields.yFields,
      'measures'
    );
    const xToConsume = [
      ...remainingXMeasures,
      ...(measureFacetConfig.fxField ? [measureFacetConfig.fxField] : [])
    ];
    const yToConsume = [
      ...remainingYMeasures,
      ...(measureFacetConfig.fyField ? [measureFacetConfig.fyField] : [])
    ];

    const newContext = FacetingPipeline.consumeFields(
      context,
      xToConsume,
      yToConsume
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
    const totalMeasures = xMeasures.length + yMeasures.length;
    const isCurrentlyMeasureFaceting = totalMeasures > 1;
    
    // If both axes have measures, we'll render a scatter matrix and won't use a category dimension
    const hasMeasuresOnBothAxes = xMeasures.length > 0 && yMeasures.length > 0;
    // For bar scenarios (single-axis measure), we may need a category dimension
    let categoryDimension: Field | null = null;
    let isDummyDimension = false;
    if (!hasMeasuresOnBothAxes) {
      const isVerticalChart = yMeasures.length > 0;
      if (isVerticalChart) {
        categoryDimension = availableXDimensions[0] || null;
      } else {
        categoryDimension = availableYDimensions[0] || null;
      }

      if (!categoryDimension) {
        isDummyDimension = true;
        const dummyDimensionName = yMeasures.length > 0 ? '_dummyX' : '_dummyY';
        categoryDimension = { id: 'dummy', columnName: dummyDimensionName, type: 'dimension', dataType: 'string', flavour: 'discrete' };
        // Inject dummy dimension into every data row
        queryResult.rows.forEach((row: any) => row[dummyDimensionName] = ' ');
        console.log(`- Created dummy dimension '${dummyDimensionName}' to control bar thickness.`);
      }
    }

    // Create facet configuration using the unified approach
    const facetConfig = createFacetConfiguration(
      facetingFields.xFields, 
      facetingFields.yFields, 
      'measures'
    );

    // Transform data for measure faceting if needed (supports both-axes measures)
    const transformedData = this.transformDataForMeasureFaceting(
      data,
      xMeasures,
      yMeasures,
      facetConfig
    );

    // Create the base chart configuration
    let marks: Plot.Markish[];
    let plotOptions: Plot.PlotOptions;

    if (hasMeasuresOnBothAxes) {
      // Scatter matrix case: default to dots when measures on both axes
      const dotConfig: any = {
        x: xMeasures.length > 1 ? '_x_value' : this.getMeasureValueForFaceting(xMeasures, facetConfig),
        y: yMeasures.length > 1 ? '_y_value' : this.getMeasureValueForFaceting(yMeasures, facetConfig),
        r: 3,
        fill: 'steelblue'
      };

      const facetedDotConfig = addFacetingToMark(dotConfig, facetConfig);

      marks = [
        Plot.dot(transformedData, facetedDotConfig)
      ];

      plotOptions = {
        marks,
        x: {
          grid: true,
          label: xMeasures.length === 1 ? getResultColumnName(xMeasures[0]) : 'Value'
        },
        y: {
          grid: true,
          label: yMeasures.length === 1 ? getResultColumnName(yMeasures[0]) : 'Value'
        }
      };
    } else if (yMeasures.length > 0) {
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
    
    console.log(`🎨 Final configuration for measure faceting:`);
    console.log(`  - Bar inset: ${isCurrentlyMeasureFaceting ? '0.6' : 'none'}`);
    console.log(`  - Scale padding: ${isCurrentlyMeasureFaceting ? '0.3' : '0.1'}`);
    console.log(`  - Faceting: fx=${facetConfig.fx || 'none'}, fy=${facetConfig.fy || 'none'}`);
    console.log(`  - Chart orientation: ${hasMeasuresOnBothAxes ? 'scatter-matrix' : (yMeasures.length > 0 ? 'vertical' : 'horizontal')}`);

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
      orientation: hasMeasuresOnBothAxes ? 'vertical' : (yMeasures.length > 0 ? 'vertical' : 'horizontal'),
      // Enhanced context for measure faceting
      isMeasureFaceting: isCurrentlyMeasureFaceting,
      originalData: isCurrentlyMeasureFaceting ? data : undefined,
      measureCount: totalMeasures
    };
    
    console.log(`📏 Sizing context: isMeasureFaceting=${isCurrentlyMeasureFaceting}, totalMeasures=${totalMeasures}, hasOriginalData=${!!data}`);
    console.log(`📊 Category dimension: ${categoryDimension ? categoryDimension.columnName : 'none'}`);
    console.log(`🎯 Chart orientation: ${hasMeasuresOnBothAxes ? 'scatter-matrix' : (yMeasures.length > 0 ? 'vertical' : 'horizontal')}`);
    console.log(`📋 Original data rows: ${data.length}, transformed data rows: ${transformedData.length}`);

    const sizingRequirements = ChartSizingCoordinator.calculateSizing(sizingContext);
    plotOptions = ChartSizingCoordinator.applySizing(plotOptions, sizingRequirements);

    return {
      plotOptions,
      usedFields: {
        xFields: [
          ...xMeasures,
          ...(categoryDimension && !hasMeasuresOnBothAxes && yMeasures.length > 0 ? [categoryDimension] : []),
          ...(facetConfig.fxField ? [facetConfig.fxField] : [])
        ],
        yFields: [
          ...yMeasures,
          ...(categoryDimension && !hasMeasuresOnBothAxes && xMeasures.length > 0 ? [categoryDimension] : []),
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
    // If no faceting needed (single measure on both axes), return original data
    if (xMeasures.length <= 1 && yMeasures.length <= 1) {
      console.log(`📋 No data transformation needed - single measure scenario`);
      return data;
    }

    const transformedData: any[] = [];

    data.forEach(row => {
      // Both-axes measures → cartesian product for scatter matrix
      if (xMeasures.length > 0 && yMeasures.length > 0) {
        xMeasures.forEach(xm => {
          const xName = getResultColumnName(xm);
          const xVal = row[xName];
          yMeasures.forEach(ym => {
            const yName = getResultColumnName(ym);
            const yVal = row[yName];
            const newRow = {
              ...row,
              ...(facetConfig.fx ? { [facetConfig.fx]: xName } : {}),
              ...(facetConfig.fy ? { [facetConfig.fy]: yName } : {}),
              _x_value: xVal,
              _y_value: yVal
            };
            transformedData.push(newRow);
          });
        });
        return; // Done for this row
      }

      // Single-axis multiple measures
      if (xMeasures.length > 1 && facetConfig.fx) {
        console.log(`🔄 Transforming data for ${xMeasures.length} X measures with facet field: ${facetConfig.fx}`);
        xMeasures.forEach(measure => {
          const measureName = getResultColumnName(measure);
          const measureValue = row[measureName];
          const newRow = {
            ...row,
            [facetConfig.fx]: measureName,
            _measure_value: measureValue
          };
          transformedData.push(newRow);
        });
      } else if (yMeasures.length > 1 && facetConfig.fy) {
        console.log(`🔄 Transforming data for ${yMeasures.length} Y measures with facet field: ${facetConfig.fy}`);
        yMeasures.forEach(measure => {
          const measureName = getResultColumnName(measure);
          const measureValue = row[measureName];
          const newRow = {
            ...row,
            [facetConfig.fy]: measureName,
            _measure_value: measureValue
          };
          transformedData.push(newRow);
        });
      } else {
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
