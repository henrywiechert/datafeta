import { BaseChart } from './baseChart';
import { ChartContext, VegaLiteSpec, ChartType } from '../types';

/**
 * Strategy for generating line charts.
 * Handles continuous X and Y with discrete dimension for grouping/coloring.
 */
export class LineChart extends BaseChart {
  readonly type: ChartType = 'line';

  canHandle(context: ChartContext): boolean {
    const { classification } = context;
    const { continuousDimensions, continuousMeasures, discreteMeasures } = classification;
    
    // Defensive checks for undefined fields
    if (!continuousDimensions || !continuousMeasures || !discreteMeasures) {
      console.warn('LineChart: Missing classification fields', { continuousDimensions, continuousMeasures, discreteMeasures });
      return false;
    }
    
    // Line chart: continuous dimension + measure (continuous or discrete)
    return continuousDimensions.length >= 1 && (continuousMeasures.length >= 1 || discreteMeasures.length >= 1);
  }

  protected applyMark(spec: VegaLiteSpec, context: ChartContext): void {
    spec.mark = {
      "type": "line",
      "point": true,
      "strokeWidth": 2
    };
  }

  protected applyEncodings(spec: VegaLiteSpec, context: ChartContext): void {
    const { classification } = context;
    const { continuousDimensions, continuousMeasures, discreteMeasures, discreteDimensions } = classification;

    // Default to horizontal orientation: continuous X, measure Y
    // X-axis: continuous dimension
    spec.encoding.x = {
      "field": this.getFieldName(continuousDimensions[0], context),
      "type": "quantitative"
    };

    // Y-axis: measure (continuous or discrete)
    if (continuousMeasures.length >= 1) {
      spec.encoding.y = {
        "field": this.getFieldName(continuousMeasures[0], context),
        "type": "quantitative"
      };
    } else {
      spec.encoding.y = {
        "field": this.getFieldName(discreteMeasures[0], context),
        "type": "quantitative"
      };
    }

    // Color encoding for grouping lines (optional)
    if (discreteDimensions.length > 0) {
      spec.encoding.color = {
        "field": this.getFieldName(discreteDimensions[0], context),
        "type": "ordinal"
      };
    }
  }
} 