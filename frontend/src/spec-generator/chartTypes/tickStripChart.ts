import { FieldClassifier } from '../fieldClassifier';
import { ChartContext, VegaLiteSpec, ChartType } from '../types';
import { BaseChart } from './baseChart';

/**
 * Strategy for generating tick-strip charts.
 * Handles continuous dimensions only - shows distribution of values as small tick marks.
 * Useful for showing distributions, outliers, or patterns in continuous data.
 */
export class TickStripChart extends BaseChart {
  readonly type: ChartType = 'tick';

  canHandle(context: ChartContext): boolean {
    const { xFields, yFields } = context;

    // We need to classify fields on each axis to make a decision
    const xClass = FieldClassifier.classifyFields(xFields, []);
    const yClass = FieldClassifier.classifyFields(yFields, []);

    const xHasContinuousDim = xClass.continuousDimensions.length > 0;
    const yHasContinuousDim = yClass.continuousDimensions.length > 0;

    // Condition 1: Must have continuous dimensions on exactly one axis.
    const hasSingleAxisContinuousDimension = (xHasContinuousDim && !yHasContinuousDim) || (yHasContinuousDim && !xHasContinuousDim);

    if (!hasSingleAxisContinuousDimension) {
      return false;
    }

    // Condition 2: The other axis must not contain a continuous measure.
    if (xHasContinuousDim && yClass.continuousMeasures.length > 0) {
      return false; // X has ContDim, Y has ContMeasure -> not a tick chart
    }

    if (yHasContinuousDim && xClass.continuousMeasures.length > 0) {
      return false; // Y has ContDim, X has ContMeasure -> not a tick chart
    }

    // This is a tick-strip chart if we have a continuous dimension on one axis
    // and the other axis does not have a continuous measure.
    return true;
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
      
      // If we only have X continuous dimension, add Y datum for proper sizing (like bar charts)
      if (!hasYContinuousDimension && !hasYDiscreteDimension) {
        spec.encoding.y = {
          "datum": "All",
          "type": "ordinal",
          "axis": {"title": null}
        };
      }
    }

    if (hasYContinuousDimension) {
      const yDimension = yDimensions.find(d => continuousDimensions.includes(d));
      spec.encoding.y = {
        "field": this.getFieldName(yDimension, context),
        "type": "quantitative",
      };
      
      // If we only have Y continuous dimension, add X datum for proper sizing (like bar charts)
      if (!hasXContinuousDimension && !hasXDiscreteDimension) {
        spec.encoding.x = {
          "datum": "All",
          "type": "ordinal",
          "axis": {"title": null}
        };
      }
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

  // Override generateSpec to handle tick marks with container sizing
  generateSpec(context: ChartContext): VegaLiteSpec {
    // Get the base spec with proper container sizing
    const spec = super.generateSpec(context);
    
    const { classification } = context;
    const { continuousDimensions, discreteDimensions, xDimensions, yDimensions } = classification;
    
    // Determine chart orientation
    const hasXContinuousDimension = xDimensions.some(d => continuousDimensions.includes(d));
    const hasYContinuousDimension = yDimensions.some(d => continuousDimensions.includes(d));
    const hasXDiscreteDimension = xDimensions.some(d => discreteDimensions.includes(d));
    const hasYDiscreteDimension = yDimensions.some(d => discreteDimensions.includes(d));
    
    // Override sizing based on orientation with explicit container sizing
    if (hasXDiscreteDimension && hasYContinuousDimension) {
      // Vertical tick strips: step width, container height
      spec.width = { "step": 40 };
      spec.height = "container";
    } else if (hasYDiscreteDimension && hasXContinuousDimension) {
      // Horizontal tick strips: container width, step height
      spec.width = "container";
      spec.height = { "step": 40 };
    } else if (hasXContinuousDimension) {
      // Horizontal tick strip: container width, step height for Y datum
      spec.width = "container";
      spec.height = { "step": 25 };
    } else if (hasYContinuousDimension) {
      // Vertical tick strip: step width for X datum, container height  
      spec.width = { "step": 25 };
      spec.height = "container";
    }
    
    // Override autosize to enable container sizing for tick marks (must be last)
    spec.autosize = { 
      type: 'pad', 
      contains: 'padding'
    };
    
    return spec;
  }
} 