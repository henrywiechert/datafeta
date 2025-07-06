import { BaseChart } from './baseChart';
import { ChartContext, VegaLiteSpec, ChartType } from '../types';

/**
 * Strategy for generating tick-strip charts.
 * Handles continuous dimensions only - shows distribution of values as small tick marks.
 * Useful for showing distributions, outliers, or patterns in continuous data.
 */
export class TickStripChart extends BaseChart {
  readonly type: ChartType = 'tick';

  canHandle(context: ChartContext): boolean {
    const { classification } = context;
    const { continuousDimensions } = classification;
    
    // Tick-strip chart: needs at least one continuous dimension
    // This is specifically for showing distributions of continuous data
    return continuousDimensions.length >= 1;
  }

  protected applyMark(spec: VegaLiteSpec, context: ChartContext): void {
    spec.mark = {
      "type": "tick",
//      "thickness": 2,
//      "size": 10
    };
  }

  protected applyEncodings(spec: VegaLiteSpec, context: ChartContext): void {
    const { classification } = context;
    const { continuousDimensions, discreteDimensions, xDimensions, yDimensions } = classification;

    // Determine orientation based on where the continuous dimension is
    const hasXContinuousDimension = xDimensions.some(d => 
      continuousDimensions.includes(d)
    );
    const hasYContinuousDimension = yDimensions.some(d => 
      continuousDimensions.includes(d)
    );
    const hasXDiscreteDimension = xDimensions.some(d => 
      discreteDimensions.includes(d)
    );
    const hasYDiscreteDimension = yDimensions.some(d => 
      discreteDimensions.includes(d)
    );

    // Handle continuous dimensions
    if (hasXContinuousDimension) {
      const xDimension = xDimensions.find(d => continuousDimensions.includes(d));
      spec.encoding.x = {
        "field": this.getFieldName(xDimension, context),
        "type": "quantitative",
      };
    }

    if (hasYContinuousDimension) {
      const yDimension = yDimensions.find(d => continuousDimensions.includes(d));
      spec.encoding.y = {
        "field": this.getFieldName(yDimension, context),
        "type": "quantitative",
      };
    }

    // Handle discrete dimensions (like bar charts do)
    if (hasXDiscreteDimension && !hasXContinuousDimension) {
      const xDimension = xDimensions.find(d => discreteDimensions.includes(d));
      spec.encoding.x = {
        "field": this.getFieldName(xDimension, context),
        "type": "ordinal",
      };
    }

    if (hasYDiscreteDimension && !hasYContinuousDimension) {
      const yDimension = yDimensions.find(d => discreteDimensions.includes(d));
      spec.encoding.y = {
        "field": this.getFieldName(yDimension, context),
        "type": "ordinal",
      };
    }
  }

  // Override generateSpec to provide explicit dimensions and prevent unwanted faceting
  generateSpec(context: ChartContext): VegaLiteSpec {
    // Create base spec WITHOUT calling super.generateSpec() to avoid faceting logic
    const baseSpec: VegaLiteSpec = {
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "A chart created by DataFeta.",
      "data": { "name": "table" },
      "encoding": {}
    };
    
    // Apply mark and encodings directly
    this.applyMark(baseSpec, context);
    this.applyEncodings(baseSpec, context);
    
    const { classification } = context;
    const { continuousDimensions, discreteDimensions, xDimensions, yDimensions } = classification;

    // Handle sizing similar to bar charts
    const hasXDiscreteDimension = xDimensions.some(d => discreteDimensions.includes(d));
    const hasYDiscreteDimension = yDimensions.some(d => discreteDimensions.includes(d));
    const hasXContinuousDimension = xDimensions.some(d => continuousDimensions.includes(d));
    const hasYContinuousDimension = yDimensions.some(d => continuousDimensions.includes(d));

    // If there's a discrete dimension on X-axis (vertical tick strips), use step sizing
    if (hasXDiscreteDimension && hasYContinuousDimension) {
      baseSpec.width = { "step": 40 }; // 40 pixels per category
      baseSpec.height = 300; // Fixed height for vertical tick strips
    }
    // If there's a discrete dimension on Y-axis (horizontal tick strips), use step sizing
    else if (hasYDiscreteDimension && hasXContinuousDimension) {
      baseSpec.height = { "step": 40 }; // 40 pixels per category
      baseSpec.width = 400; // Fixed width for horizontal tick strips
    }
    // Single continuous dimension cases
    else if (hasXContinuousDimension) {
      // Horizontal tick strip (continuous dimension on X-axis)
      baseSpec.width = 400;
      baseSpec.height = 60;
    } else if (hasYContinuousDimension) {
      // Vertical tick strip (continuous dimension on Y-axis)
      baseSpec.width = 60;
      baseSpec.height = 400;
    } else {
      // Default sizing for horizontal strip
      baseSpec.width = 400;
      baseSpec.height = 60;
    }

    return baseSpec;
  }
} 