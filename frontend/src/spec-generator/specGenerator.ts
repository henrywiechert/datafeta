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
  
  // Separate measures from dimensions
  const xMeasures = xFields.filter((f) => f.type === 'measure');
  const yMeasures = yFields.filter((f) => f.type === 'measure');
  const xDimensions = xFields.filter((f) => f.type === 'dimension');
  const yDimensions = yFields.filter((f) => f.type === 'dimension');
  
  // Determine if we have faceting (multiple charts)
  // Faceting occurs when we have multiple dimensions that would create a grid of sub-charts
  const hasFaceting = (xDimensions.length > 1) || 
                     (yDimensions.length > 1) ||
                     (xDimensions.length > 0 && yDimensions.length > 0 && (xContinuous.length > 0 || yContinuous.length > 0));
  
  const baseSpec: VegaLiteSpec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "A chart created by DataFeta.",
    "data": { "name": "table" }, // Data will be provided by react-vega
    "encoding": {},
    // Configure sizing and layout
    "config": {
      "view": {
        "stroke": "transparent"
      },
      "facet": {
        "spacing": 10
      }
    }
  };

  // Add responsive sizing - charts should fill available space
  if (hasFaceting) {
    // For faceted charts, use smaller individual chart sizes to allow scrolling
    baseSpec.width = 200;
    baseSpec.height = 150;
    baseSpec.resolve = {
      "scale": {
        "x": "independent",
        "y": "independent"
      }
    };
  } else {
    // Single charts should fill the complete available area
    // NOTE: This will be overridden for bar charts which need natural sizing
    baseSpec.width = "container";
    baseSpec.height = "container";
  }

  // Rule: Line Chart (continuous X and Y with discrete dimension for grouping)
  if (xContinuous.length > 0 && yContinuous.length > 0 && xDiscrete.length > 0) {
    baseSpec.mark = {
      "type": "line",
      "point": true,
      "strokeWidth": 2
    };
    baseSpec.encoding.x = {
      "field": getResultColumnName(xContinuous[0]),
      "type": "quantitative"
    };
    baseSpec.encoding.y = {
      "field": getResultColumnName(yContinuous[0]),
      "type": "quantitative"
    };
    baseSpec.encoding.color = {
      "field": getResultColumnName(xDiscrete[0]),
      "type": "ordinal"
    };
    
    // Faceting for line charts
    if(yDiscrete.length > 0) {
      baseSpec.encoding.row = {"field": getResultColumnName(yDiscrete[0]), "type": "ordinal"};
    }
    if(xDiscrete.length > 1) {
      baseSpec.encoding.column = {"field": getResultColumnName(xDiscrete[1]), "type": "ordinal"};
    }

    return baseSpec;
  }

  // Rule: Scatter Plot (two continuous dimensions)
  if (xContinuous.length > 0 && yContinuous.length > 0) {
    baseSpec.mark = {
      "type": "point",
      "size": 60
    };
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

  // Rule: Vertical Bar Chart (Y-axis measures, X-axis dimensions)
  if (yMeasures.length > 0) {
    baseSpec.mark = {
      "type": "bar",
      "width": 20 // Absolute width in pixels for consistent bar size
    };
    baseSpec.encoding.y = {
      "field": getResultColumnName(yMeasures[0]),
      "type": "quantitative",
    };
    
    // Set up categorical X axis
    if (xDimensions.length > 0) {
      baseSpec.encoding.x = {
        "field": getResultColumnName(xDimensions[0]),
        "type": "ordinal",
        "scale": {
          "paddingInner": 0.3, // Spacing between bars (absolute spacing)
          "paddingOuter": 0.2  // Spacing at the ends
        }
      };
    } else {
      // No dimensions - create a single-category bar chart
      // Use a constant value for the X axis to create a single bar
      baseSpec.encoding.x = {
        "datum": "Total",
        "type": "ordinal",
        "axis": {"title": null} // Hide the axis title since it's not meaningful
      };
    }
    
    // Handle faceting for bar charts
    if(xDimensions.length > 1) {
      baseSpec.encoding.column = {"field": getResultColumnName(xDimensions[1]), "type": "ordinal"};
    }
    if(yDimensions.length > 0) {
      baseSpec.encoding.row = {"field": getResultColumnName(yDimensions[0]), "type": "ordinal"};
    }
    
    return baseSpec;
  }
  
  // Rule: Horizontal Bar Chart (X-axis measures, Y-axis dimensions)
  if (xMeasures.length > 0) {
    baseSpec.mark = {
      "type": "bar",
      "height": 20 // Absolute height in pixels for consistent bar size
    };
    baseSpec.encoding.x = {
      "field": getResultColumnName(xMeasures[0]),
      "type": "quantitative",
    };
    
    // Set up categorical Y axis
    if (yDimensions.length > 0) {
      baseSpec.encoding.y = {
        "field": getResultColumnName(yDimensions[0]),
        "type": "ordinal",
        "scale": {
          "paddingInner": 0.3, // Spacing between bars (absolute spacing)
          "paddingOuter": 0.2  // Spacing at the ends
        }
      };
    } else {
      // No dimensions - create a single-category bar chart
      // Use a constant value for the Y axis to create a single bar
      baseSpec.encoding.y = {
        "datum": "Total",
        "type": "ordinal",
        "axis": {"title": null} // Hide the axis title since it's not meaningful
      };
    }
    
    // Handle faceting for bar charts
    if(yDimensions.length > 1) {
      baseSpec.encoding.row = {"field": getResultColumnName(yDimensions[1]), "type": "ordinal"};
    }
    if(xDimensions.length > 0) {
      baseSpec.encoding.column = {"field": getResultColumnName(xDimensions[0]), "type": "ordinal"};
    }
    
    return baseSpec;
  }
  
  // Fallback: No chart
  return {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "description": "Drag fields to the axes to create a chart.",
    "width": "container",
    "height": "container"
  };
} 