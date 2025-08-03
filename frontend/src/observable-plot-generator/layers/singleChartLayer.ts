import * as Plot from '@observablehq/plot';
import { FacetingLayer, FacetingContext, FacetedResult, ChartSpec, FacetingPipeline } from '../facetingPipeline';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Layer 1: Single Chart Generation
 * 
 * Responsibility:
 * - Select minimal fields needed for one base chart (1 measure + required dimensions)
 * - Generate pure chart specification without faceting
 * - Consume used fields, leave remaining for subsequent layers
 */
export class SingleChartLayer implements FacetingLayer {
  name = "Single Chart Generation";

  canApply(context: FacetingContext): boolean {
    const { remainingXFields, remainingYFields } = context;
    
    // Can apply if we have at least one measure
    const hasMeasure = [...remainingXFields, ...remainingYFields].some(f => f.type === 'measure');
    return hasMeasure;
  }

  apply(context: FacetingContext): FacetedResult {
    const { remainingXFields, remainingYFields, queryResult } = context;
    
    // Classify remaining fields
    const xMeasures = remainingXFields.filter(f => f.type === 'measure');
    const yMeasures = remainingYFields.filter(f => f.type === 'measure');
    const xDimensions = remainingXFields.filter(f => f.type === 'dimension');
    const yDimensions = remainingYFields.filter(f => f.type === 'dimension');

    // Field selection strategy for single chart:
    // 1. Take ONE measure (prefer Y-axis for vertical bars, X-axis for horizontal)
    // 2. Take ONE dimension from the opposite axis (for categories)
    // 3. Leave remaining fields for subsequent layers

    let selectedMeasure: Field;
    let selectedDimension: Field | null = null;
    let measureAxis: 'x' | 'y';
    let usedXFields: Field[] = [];
    let usedYFields: Field[] = [];

    if (yMeasures.length > 0) {
      // Vertical bar chart - measure on Y
      selectedMeasure = yMeasures[0]; // Take first measure
      measureAxis = 'y';
      usedYFields.push(selectedMeasure);
      
      // Take one dimension from X for categories (if available)
      if (xDimensions.length > 0) {
        // For single chart, take the LAST dimension (closest to categories)
        selectedDimension = xDimensions[xDimensions.length - 1];
        usedXFields.push(selectedDimension);
      }
    } else if (xMeasures.length > 0) {
      // Horizontal bar chart - measure on X
      selectedMeasure = xMeasures[0]; // Take first measure
      measureAxis = 'x';
      usedXFields.push(selectedMeasure);
      
      // Take one dimension from Y for categories (if available)
      if (yDimensions.length > 0) {
        // For single chart, take the LAST dimension (closest to categories)
        selectedDimension = yDimensions[yDimensions.length - 1];
        usedYFields.push(selectedDimension);
      }
    } else {
      throw new Error('No measure found for single chart generation');
    }

    // Generate single chart specification
    const chartSpec = this.generateSingleChart(
      selectedMeasure,
      selectedDimension,
      measureAxis,
      queryResult
    );

    // Consume used fields
    const newContext = FacetingPipeline.consumeFields(context, usedXFields, usedYFields);

    return {
      charts: [chartSpec],
      finalContext: newContext
    };
  }

  private generateSingleChart(
    measure: Field,
    dimension: Field | null,
    measureAxis: 'x' | 'y',
    queryResult: any
  ): ChartSpec {
    const data = queryResult.rows;
    const measureName = getResultColumnName(measure);
    const barStep = 40;

    if (measureAxis === 'y') {
      // Vertical bar chart
      const barConfig: any = {
        y: measureName,
        fill: "steelblue",
      };

      if (dimension) {
        barConfig.x = dimension.columnName;
      }

      // Calculate width
      let width = barStep * 2;
      if (dimension) {
        const categorySet = new Set(data.map((row: any) => row[dimension.columnName]));
        width = categorySet.size * barStep;
      }

      return {
        plotOptions: {
          width,
          marks: [
            Plot.barY(data, barConfig),
            Plot.ruleY([0])
          ],
          x: {
            label: dimension ? dimension.columnName : " ",
          },
          y: {
            grid: true,
            label: measureName,
          },
        },
        usedFields: {
          xFields: dimension ? [dimension] : [],
          yFields: [measure]
        }
      };
    } else {
      // Horizontal bar chart
      const barConfig: any = {
        x: measureName,
        fill: "steelblue",
      };

      if (dimension) {
        barConfig.y = dimension.columnName;
      }

      // Calculate height
      let height = barStep * 2;
      if (dimension) {
        const categorySet = new Set(data.map((row: any) => row[dimension.columnName]));
        height = categorySet.size * barStep;
      }

      return {
        plotOptions: {
          height,
          marks: [
            Plot.barX(data, barConfig),
            Plot.ruleX([0])
          ],
          y: {
            label: dimension ? dimension.columnName : " ",
          },
          x: {
            grid: true,
            label: measureName,
          },
        },
        usedFields: {
          xFields: [measure],
          yFields: dimension ? [dimension] : []
        }
      };
    }
  }
}