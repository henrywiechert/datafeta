import { Field } from '../types';

/**
 * The recipe for the entire chart grid.
 * This is the output of the Specification Generator.
 */
export interface GridSpec {
  /**
   * Defines how the grid is broken into small multiples (facets).
   * These arrays will contain the discrete dimension fields that split the data.
   */
  facets: {
    rows: Field[];
    columns: Field[];
  };

  /**
   * Defines the chart to be rendered inside EACH cell of the grid.
   */
  cell: CellSpec;

  /**
   * Any errors that occurred during spec generation that need to be
   * displayed to the user instead of a chart.
   */
  errors?: { title: string; message: string }[];
}

/**
 * The recipe for a single chart cell in the grid.
 */
export interface CellSpec {
  /**
   * The type of mark to draw in the cell.
   */
  chartType: 'bar' | 'scatter' | 'table';

  /**
   * Defines which fields are mapped to the visual properties of the chart.
   */
  encoding: {
    x?: Field;
    y?: Field;
  };

  /**
   * Optional properties for the chart, e.g., for bar chart orientation.
   */
  orientation?: 'vertical' | 'horizontal';
}

interface SpecGeneratorArgs {
  xFields: Field[];
  yFields: Field[];
}

/**
 * Translates the state of the X and Y drop zones into a declarative
 * specification for rendering the chart grid.
 *
 * @param args - The fields placed on the X and Y axes.
 * @returns A GridSpec object that declaratively describes the visualization.
 */
export function generateGridSpec(args: SpecGeneratorArgs): GridSpec {
  const { xFields, yFields } = args;

  // 1. Handle empty state
  if (xFields.length === 0 && yFields.length === 0) {
    return {
      facets: { rows: [], columns: [] },
      cell: {
        chartType: 'scatter', // Placeholder, won't be rendered
        encoding: {},
      },
    };
  }

  // 2. Categorize fields
  const xContinuous = xFields.filter((f) => f.flavour === 'continuous');
  const yContinuous = yFields.filter((f) => f.flavour === 'continuous');
  const xDiscrete = xFields.filter((f) => f.flavour === 'discrete');
  const yDiscrete = yFields.filter((f) => f.flavour === 'discrete');

  // 3. Scatter Plot Rule
  if (xContinuous.length > 0 && yContinuous.length > 0) {
    // The first continuous measure on each axis defines the encoding.
    const xEnc = xContinuous[0];
    const yEnc = yContinuous[0];

    // All other fields become facets.
    // - All discrete fields are used for faceting.
    // - Additional continuous fields on an axis create side-by-side charts (facets).
    const colFacets = xDiscrete.concat(xContinuous.slice(1));
    const rowFacets = yDiscrete.concat(yContinuous.slice(1));

    return {
      facets: {
        columns: colFacets,
        rows: rowFacets,
      },
      cell: {
        chartType: 'scatter',
        encoding: { x: xEnc, y: yEnc },
      },
    };
  }

  // 4. Bar Chart Rule (and faceting)
  if (yContinuous.length > 0) {
    // Y-axis has measures -> Vertical Bar Chart
    const yEnc = yContinuous[0]; // Primary measure
    const xEnc = xDiscrete[0]; // Primary dimension for axis (can be undefined)

    const colFacets = xDiscrete.slice(1); // Remaining dimensions on X
    const rowFacets = yDiscrete.concat(yContinuous.slice(1)); // All dimensions on Y and other measures

    return {
      facets: {
        columns: colFacets,
        rows: rowFacets,
      },
      cell: {
        chartType: 'bar',
        encoding: { x: xEnc, y: yEnc },
        orientation: 'vertical',
      },
    };
  }

  if (xContinuous.length > 0) {
    // X-axis has measures -> Horizontal Bar Chart
    const xEnc = xContinuous[0]; // Primary measure
    const yEnc = yDiscrete[0]; // Primary dimension for axis (can be undefined)

    const colFacets = xDiscrete.concat(xContinuous.slice(1));
    const rowFacets = yDiscrete.slice(1);

    return {
      facets: {
        columns: colFacets,
        rows: rowFacets,
      },
      cell: {
        chartType: 'bar',
        encoding: { x: xEnc, y: yEnc },
        orientation: 'horizontal',
      },
    };
  }

  // 5. Tabulation Rule (only discrete dimensions)
  if (xDiscrete.length > 0 || yDiscrete.length > 0) {
    return {
      facets: {
        columns: xDiscrete.slice(1),
        rows: yDiscrete.slice(1),
      },
      cell: {
        chartType: 'table',
        encoding: {
          x: xDiscrete[0],
          y: yDiscrete[0],
        },
      },
    };
  }

  // Fallback for any unhandled cases.
  return {
    facets: { rows: [], columns: [] },
    cell: {
      chartType: 'scatter',
      encoding: {},
    },
    errors: [
      {
        title: 'Unsupported Chart',
        message: "The combination of fields you've selected is not yet supported.",
      },
    ],
  };
} 