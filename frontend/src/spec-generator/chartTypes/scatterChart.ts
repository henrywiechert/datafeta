import { BaseChart } from './baseChart';
import { ChartContext, VegaLiteSpec, ChartType } from '../types';

/**
 * Strategy for generating scatter plots.
 * Handles two continuous dimensions for X and Y axes.
 */
export class ScatterChart extends BaseChart {
  readonly type: ChartType = 'scatter';

  canHandle(context: ChartContext): boolean {
    const { classification } = context;
    const { continuousDimensions } = classification;
    
    // Scatter plot requires continuous dimensions on both axes
    return continuousDimensions.length >= 2;
  }

  protected applyMark(spec: VegaLiteSpec, context: ChartContext): void {
    spec.mark = {
      "type": "point",
      "size": 60
    };
  }

  protected applyEncodings(spec: VegaLiteSpec, context: ChartContext): void {
    const { classification } = context;
    const { continuousDimensions } = classification;

    // Default to horizontal orientation: continuous X, continuous Y
    // X-axis: continuous dimension
    spec.encoding.x = {
      "field": this.getFieldName(continuousDimensions[0], context),
      "type": "quantitative"
    };

    // Y-axis: continuous dimension
    spec.encoding.y = {
      "field": this.getFieldName(continuousDimensions[1], context),
      "type": "quantitative"
    };
  }

  // Override generateSpec to ensure proper container sizing
  generateSpec(context: ChartContext): VegaLiteSpec {
    const spec = super.generateSpec(context);

    // Ensure autosize is set to 'pad' to prevent stretching and enable container sizing
    spec.autosize = { type: 'pad', contains: 'padding' };

    return spec;
  }
} 