import { BaseChart } from './baseChart';
import { ChartContext, VegaLiteSpec, ChartType } from '../types';

/**
 * Strategy for generating bar charts.
 * Handles discrete dimensions + measures with vertical default orientation.
 */
export class BarChart extends BaseChart {
  readonly type: ChartType = 'bar';

  canHandle(context: ChartContext): boolean {
    const { classification } = context;
    const { continuousMeasures, discreteMeasures } = classification;
    
    // Bar chart: needs at least one measure, dimensions are optional
    // Case 1: discrete dimension + measure (normal bar chart)
    // Case 2: just a measure (single bar chart)
    return continuousMeasures.length >= 1 || discreteMeasures.length >= 1;
  }

  protected applyMark(spec: VegaLiteSpec, context: ChartContext): void {
    spec.mark = {
      "type": "bar",
      // "width": 20 // Removed: Absolute width caused bars to overlap or squeeze
    };
  }

  protected applyEncodings(spec: VegaLiteSpec, context: ChartContext): void {
    const { classification } = context;
    const { discreteDimensions, continuousMeasures, discreteMeasures, xMeasures, yMeasures, xDimensions, yDimensions } = classification;

    // Determine orientation based on where measures and dimensions are
    const hasYMeasure = yMeasures.length > 0;
    const hasXMeasure = xMeasures.length > 0;
    const hasXDimension = xDimensions.length > 0;
    const hasYDimension = yDimensions.length > 0;

    if (hasYMeasure) {
      // Vertical bar chart: measure on Y-axis
      // Y-axis: measure
      spec.encoding.y = {
        "field": this.getFieldName(yMeasures[0], context),
        "type": "quantitative"
      };

      // X-axis: dimension or fixed value
      if (hasXDimension) {
        spec.encoding.x = {
          "field": this.getFieldName(xDimensions[0], context),
          "type": "ordinal",
          "scale": {"rangeStep": 25} // Ensure minimum bar width for discrete x-axis
        };
      } else {
        // Single bar case
        spec.encoding.x = {
          "datum": "Total",
          "type": "ordinal",
          "axis": {"title": null}
        };
      }
    } else if (hasXMeasure) {
      // Horizontal bar chart: measure on X-axis
      // X-axis: measure
      spec.encoding.x = {
        "field": this.getFieldName(xMeasures[0], context),
        "type": "quantitative"
      };

      // Y-axis: dimension or fixed value
      if (hasYDimension) {
        spec.encoding.y = {
          "field": this.getFieldName(yDimensions[0], context),
          "type": "ordinal",
          "scale": {"rangeStep": 25} // Ensure minimum bar height for discrete y-axis
        };
      } else {
        // Single bar case
        spec.encoding.y = {
          "datum": "Total",
          "type": "ordinal",
          "axis": {"title": null}
        };
      }
    }
  }
} 