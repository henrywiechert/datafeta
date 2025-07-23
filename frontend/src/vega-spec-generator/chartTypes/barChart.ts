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
        return this.generateSingleMeasureSpec(allMeasures[0], queryResult.rows);
    }

    // Standard bar chart with one dimension and one measure
    const measure = allMeasures[0];
    const dimension = allDimensions.find(d => d.flavour === 'discrete');
    
    if (!measure || !dimension) {
        return this.createEmptySpec();
    }

    const isVertical = yDimensions.includes(dimension);

    const spec: any = {
      "$schema": "https://vega.github.io/schema/vega/v5.json",
      "width": 400,
      "height": 200,
      "padding": 5,
      "data": [
        { "name": "table", "values": queryResult.rows }
      ],
      "scales": [],
      "axes": [],
      "marks": []
    };

    const valueField = measure.aggregation ? `${measure.aggregation}_${measure.columnName}` : measure.columnName;
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

  private generateSingleMeasureSpec(measure: Field, data: any[]): VegaSpec {
    const valueField = measure.aggregation ? `${measure.aggregation}_${measure.columnName}` : measure.columnName;
    const value = data[0] ? data[0][valueField] : 0;

    return {
        "$schema": "https://vega.github.io/schema/vega/v5.json",
        "width": 400,
        "height": 50,
        "padding": 5,
        "data": [
          { "name": "table", "values": [{ "amount": value }] }
        ],
        "scales": [
          { "name": "xscale", "type": "linear", "domain": [0, value * 1.2], "range": "width" }
        ],
        "axes": [
          { "orient": "bottom", "scale": "xscale" }
        ],
        "marks": [
          {
            "type": "rect",
            "from": {"data": "table"},
            "encode": {
              "enter": {
                "y": {"value": 10},
                "height": {"value": 30},
                "x": {"scale": "xscale", "value": 0},
                "x2": {"scale": "xscale", "field": "amount"},
                "fill": {"value": "steelblue"}
              }
            }
          }
        ]
    };
  }

  private createEmptySpec(): VegaSpec {
    return {
      "$schema": "https://vega.github.io/schema/vega/v5.json",
      "description": "No data to display for the bar chart.",
    };
  }
} 