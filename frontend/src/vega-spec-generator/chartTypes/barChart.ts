import { ChartContext, VegaSpec } from '../types';
import { VegaChartStrategy } from './baseChart';
import { Field } from '../../types';

export class BarChart implements VegaChartStrategy {
  type = 'bar';

  canHandle(context: ChartContext): boolean {
    const { classification } = context;
    const { xDimensions, yDimensions, xMeasures, yMeasures } = classification;

    // A bar chart can be created if there is at least one discrete dimension and one measure.
    const hasDiscreteDimension = xDimensions.some(d => d.flavour === 'discrete') || yDimensions.some(d => d.flavour === 'discrete');
    const hasMeasure = xMeasures.length > 0 || yMeasures.length > 0;
    
    // Also handle single measure case
    const isSingleMeasure = (xMeasures.length + yMeasures.length === 1) && (xDimensions.length + yDimensions.length === 0);

    return (hasDiscreteDimension && hasMeasure) || isSingleMeasure;
  }

  generateSpec(context: ChartContext): VegaSpec {
    const { classification, queryResult } = context;

    if (!queryResult || queryResult.rows.length === 0) {
      return this.createEmptySpec();
    }

    const { xMeasures, yMeasures, xDimensions, yDimensions } = classification;
    const allMeasures = [...xMeasures, ...yMeasures];
    const allDimensions = [...xDimensions, ...yDimensions];
    
    // Single measure case
    if (allMeasures.length === 1 && allDimensions.length === 0) {
        return this.generateSingleMeasureSpec(context);
    }

    // Standard bar chart with one dimension and one measure
    const measure = allMeasures[0];
    const isMeasureOnX = xMeasures.length > 0;

    // Dimensions for the bar chart categories should be on the opposite axis of the measure.
    const categoricalDimensions = (isMeasureOnX ? yDimensions : xDimensions).filter(d => d.flavour === 'discrete');
    
    // If for some reason there are no discrete dimensions on the opposite axis, fall back to any discrete dimension.
    // This maintains robustness, although faceting might handle this scenario differently.
    const dimension = categoricalDimensions.length > 0 
        ? categoricalDimensions[categoricalDimensions.length - 1] // Get the last one from the opposite axis
        : allDimensions.filter(d => d.flavour === 'discrete').pop(); // Fallback to the last discrete dimension available
    
    if (!measure || !dimension) {
        return this.createEmptySpec();
    }

    const isVertical = yDimensions.includes(dimension);

    const spec: any = {
      "$schema": "https://vega.github.io/schema/vega/v5.json",
      "autosize": { "type": "fit", "contains": "padding", "resize": true },
      "padding": 5,
      "width": {"signal": "width"},
      "height": {"signal": "height"},
      "data": [
        { "name": "table", "values": queryResult.rows }
      ],
      "scales": [],
      "axes": [],
      "marks": []
    };

    const valueField = measure.aggregation ? `${measure.aggregation.toUpperCase()}(${measure.columnName})` : measure.columnName;
    const categoryField = dimension.columnName;

    if (isVertical) {
      spec.scales.push(
        { "name": "xscale", "type": "linear", "domain": {"data": "table", "field": valueField}, "range": "width", "nice": true },
        { "name": "yscale", "type": "band", "domain": {"data": "table", "field": categoryField}, "range": "height", "padding": 0.1 }
      );
      spec.axes.push(
        { "orient": "bottom", "scale": "xscale" },
        { "orient": "left", "scale": "yscale" }
      );
      spec.marks.push({
        "type": "rect",
        "from": {"data": "table"},
        "encode": {
          "enter": {
            "y": {"scale": "yscale", "field": categoryField},
            "height": {"scale": "yscale", "band": 1},
            "x": {"scale": "xscale", "field": valueField},
            "x2": {"scale": "xscale", "value": 0},
            "fill": {"value": "steelblue"}
          }
        }
      });
    } else { // Horizontal
      spec.scales.push(
        { "name": "xscale", "type": "band", "domain": {"data": "table", "field": categoryField}, "range": "width", "padding": 0.1 },
        { "name": "yscale", "type": "linear", "domain": {"data": "table", "field": valueField}, "range": "height", "nice": true }
      );
      spec.axes.push(
        { "orient": "bottom", "scale": "xscale" },
        { "orient": "left", "scale": "yscale" }
      );
      spec.marks.push({
        "type": "rect",
        "from": {"data": "table"},
        "encode": {
          "enter": {
            "x": {"scale": "xscale", "field": categoryField},
            "width": {"scale": "xscale", "band": 1},
            "y": {"scale": "yscale", "field": valueField},
            "y2": {"scale": "yscale", "value": 0},
            "fill": {"value": "steelblue"}
          }
        }
      });
    }

    return spec;
  }

  private generateSingleMeasureSpec(context: ChartContext): VegaSpec {
    const { classification, queryResult } = context;
    if (!queryResult || queryResult.rows.length === 0) {
      return this.createEmptySpec();
    }
    const { xMeasures, yMeasures } = classification;
    const data = queryResult.rows;

    const measure = xMeasures.length > 0 ? xMeasures[0] : yMeasures[0];
    const isVertical = yMeasures.length > 0;

    const valueField = measure.aggregation ? `${measure.aggregation.toUpperCase()}(${measure.columnName})` : measure.columnName;

    const spec: any = {
        "$schema": "https://vega.github.io/schema/vega/v5.json",
        "autosize": { "type": "fit", "contains": "padding", "resize": true },
        "padding": 5,
        "width": {"signal": "width"},
        "height": {"signal": "height"},
        "data": [
          { "name": "table", "values": data }
        ],
        "scales": [],
        "axes": [],
        "marks": []
    };
    
    if (isVertical) {
        spec.scales = [
          { 
            "name": "yscale", 
            "type": "linear", 
            "domain": { "data": "table", "field": valueField }, 
            "range": "height",
            "nice": true,
            "zero": true
          }
        ];
        spec.axes = [
          { "orient": "left", "scale": "yscale" }
        ];
        spec.marks = [
          {
            "type": "rect",
            "from": {"data": "table"},
            "encode": {
              "enter": {
                "x": {"signal": "width * 0.4"},
                "width": {"signal": "width * 0.2"},
                "y": {"scale": "yscale", "field": valueField},
                "y2": {"scale": "yscale", "value": 0},
                "fill": {"value": "steelblue"}
              }
            }
          }
        ];
    } else { // Horizontal
        spec.scales = [
          { 
            "name": "xscale", 
            "type": "linear", 
            "domain": { "data": "table", "field": valueField }, 
            "range": "width",
            "nice": true,
            "zero": true
          }
        ];
        spec.axes = [
          { "orient": "bottom", "scale": "xscale" }
        ];
        spec.marks = [
          {
            "type": "rect",
            "from": {"data": "table"},
            "encode": {
              "enter": {
                "y": {"signal": "height * 0.4"},
                "height": {"signal": "height * 0.2"},
                "x": {"scale": "xscale", "value": 0},
                "x2": {"scale": "xscale", "field": valueField},
                "fill": {"value": "steelblue"}
              }
            }
          }
        ];
    }

    return spec;
  }

  private createEmptySpec(): VegaSpec {
    return {
      "$schema": "https://vega.github.io/schema/vega/v5.json",
      "description": "No data to display for the bar chart.",
    };
  }
} 