import { Field } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';

// This is a basic Vega-Lite spec. We will be building this object.
// We are using 'any' because we couldn't install the @types/vega-lite package.
export type VegaLiteSpec = any;

interface SpecGeneratorArgs {
  xFields: Field[];
  yFields: Field[];
}

/**
 * Translates the state of the X and Y drop zones into a declarative
 * Vega-Lite specification for rendering the chart grid.
 *
 * @param args - The fields placed on the X and Y axes.
 * @returns A VegaLiteSpec object.
 */
export function generateVegaLiteSpec(args: SpecGeneratorArgs): VegaLiteSpec {
  const { xFields, yFields } = args;

  const xContinuous = xFields.filter((f) => f.flavour === 'continuous');
  const yContinuous = yFields.filter((f) => f.flavour === 'continuous');
  const xDiscrete = xFields.filter((f) => f.flavour === 'discrete');
  const yDiscrete = yFields.filter((f) => f.flavour === 'discrete');
  
  const baseSpec: VegaLiteSpec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "A chart created by DataFeta.",
    "data": { "name": "table" }, // Data will be provided by react-vega
    "encoding": {},
  };

  // Rule: Scatter Plot
  if (xContinuous.length > 0 && yContinuous.length > 0) {
    baseSpec.mark = "point";
    baseSpec.encoding.x = {
      "field": getResultColumnName(xContinuous[0]),
      "type": "quantitative"
    };
    baseSpec.encoding.y = {
      "field": getResultColumnName(yContinuous[0]),
      "type": "quantitative"
    };
    
    // Faceting
    if(yDiscrete.length > 0) {
      baseSpec.encoding.row = {"field": getResultColumnName(yDiscrete[0]), "type": "ordinal"};
    }
    if(xDiscrete.length > 0) {
      baseSpec.encoding.column = {"field": getResultColumnName(xDiscrete[0]), "type": "ordinal"};
    }

    return baseSpec;
  }

  // Rule: Bar Chart
  if (yContinuous.length > 0) { // Vertical Bar Chart
    baseSpec.mark = "bar";
    baseSpec.encoding.y = {
      "field": getResultColumnName(yContinuous[0]),
      "type": "quantitative",
    };
    if (xDiscrete.length > 0) {
      baseSpec.encoding.x = {
        "field": getResultColumnName(xDiscrete[0]),
        "type": "ordinal",
      };
    }
    // Handle faceting for bar charts
    if(xDiscrete.length > 1) {
      baseSpec.encoding.column = {"field": getResultColumnName(xDiscrete[1]), "type": "ordinal"};
    }
    if(yDiscrete.length > 0) {
      baseSpec.encoding.row = {"field": getResultColumnName(yDiscrete[0]), "type": "ordinal"};
    }
    return baseSpec;
  }
  
  if (xContinuous.length > 0) { // Horizontal Bar Chart
    baseSpec.mark = "bar";
    baseSpec.encoding.x = {
      "field": getResultColumnName(xContinuous[0]),
      "type": "quantitative",
    };
    if (yDiscrete.length > 0) {
      baseSpec.encoding.y = {
        "field": getResultColumnName(yDiscrete[0]),
        "type": "ordinal",
      };
    }
    // Handle faceting for bar charts
    if(yDiscrete.length > 1) {
      baseSpec.encoding.row = {"field": getResultColumnName(yDiscrete[1]), "type": "ordinal"};
    }
    if(xDiscrete.length > 0) {
      baseSpec.encoding.column = {"field": getResultColumnName(xDiscrete[0]), "type": "ordinal"};
    }
    return baseSpec;
  }
  
  // Fallback: No chart
  return {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "Drag fields to the axes to create a chart.",
  };
} 