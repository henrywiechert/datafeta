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

    const isVertical = xDimensions.includes(dimension);

    // Fixed bar thickness and spacing
    const BAR_THICKNESS = 40; // Fixed pixel thickness for bars
    const BAR_SPACING = 10;   // Fixed pixel spacing between bars
    const CHART_PADDING = 20; // Padding around the chart

    // Get unique categories and calculate chart dimensions
    const uniqueCategories = Array.from(new Set(queryResult.rows.map(row => row[dimension.columnName]))).sort();
    const categoricalSize = uniqueCategories.length * (BAR_THICKNESS + BAR_SPACING) - BAR_SPACING + (2 * CHART_PADDING);
    
    const spec: any = {
      "$schema": "https://vega.github.io/schema/vega/v5.json",
      "autosize": { "type": "pad", "contains": "content" },
      "padding": 5,
      "data": [
        { "name": "table", "values": queryResult.rows }
      ],
      "scales": [],
      "axes": [],
      "marks": []
    };

    // Set hybrid dimensions: responsive primary axis, fixed categorical axis
    if (isVertical) {
      // Vertical bars: fixed width (categorical), responsive height (measure)
      spec.width = categoricalSize;
      spec.height = {"signal": "height"}; // Will be provided by container
    } else {
      // Horizontal bars: responsive width (measure), fixed height (categorical)
      spec.width = {"signal": "width"}; // Will be provided by container
      spec.height = categoricalSize;
    }

    const valueField = measure.aggregation ? `${measure.aggregation.toUpperCase()}(${measure.columnName})` : measure.columnName;
    const categoryField = dimension.columnName;

    if (isVertical) {
      // Vertical bars: categories on X-axis, measures on Y-axis
      spec.scales.push(
        { "name": "xscale", "type": "ordinal", "domain": uniqueCategories, "range": uniqueCategories.map((_, i) => CHART_PADDING + i * (BAR_THICKNESS + BAR_SPACING)) },
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
            "width": {"value": BAR_THICKNESS},
            "y": {"scale": "yscale", "field": valueField},
            "y2": {"scale": "yscale", "value": 0},
            "fill": {"value": "steelblue"}
          }
        }
      });
    } else { // Horizontal
      // Horizontal bars: categories on Y-axis, measures on X-axis  
      spec.scales.push(
        { "name": "xscale", "type": "linear", "domain": {"data": "table", "field": valueField}, "range": "width", "nice": true },
        { "name": "yscale", "type": "ordinal", "domain": uniqueCategories, "range": uniqueCategories.map((_, i) => CHART_PADDING + i * (BAR_THICKNESS + BAR_SPACING)) }
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
            "height": {"value": BAR_THICKNESS},
            "x": {"scale": "xscale", "value": 0},
            "x2": {"scale": "xscale", "field": valueField},
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

    // Fixed dimensions for single bar
    const BAR_THICKNESS = 40;
    const CHART_PADDING = 30;

    const spec: any = {
        "$schema": "https://vega.github.io/schema/vega/v5.json",
        "autosize": { "type": "pad", "contains": "content" },
        "padding": 5,
        "data": [
          { "name": "table", "values": data }
        ],
        "scales": [],
        "axes": [],
        "marks": []
    };
    
    if (isVertical) {
        // Single vertical bar: fixed width, responsive height
        spec.width = BAR_THICKNESS + (2 * CHART_PADDING);
        spec.height = {"signal": "height"};
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
                "x": {"value": CHART_PADDING},
                "width": {"value": BAR_THICKNESS},
                "y": {"scale": "yscale", "field": valueField},
                "y2": {"scale": "yscale", "value": 0},
                "fill": {"value": "steelblue"}
              }
            }
          }
        ];
    } else { // Horizontal
        // Single horizontal bar: responsive width, fixed height
        spec.width = {"signal": "width"};
        spec.height = BAR_THICKNESS + (2 * CHART_PADDING);
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
                "y": {"value": CHART_PADDING},
                "height": {"value": BAR_THICKNESS},
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