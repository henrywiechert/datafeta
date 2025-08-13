import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barChart } from './chartTypes/barChart';
import { multiMeasureBarChart } from './chartTypes/multiMeasureBarChart';
import { getResultColumnName } from '../utils/fieldUtils';
import { tickStrip } from './chartTypes/tickStrip';
import { lineChart } from './chartTypes/lineChart';
import { scatterChart } from './chartTypes/scatterChart';
import { Field } from '../types';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../config/chartLayoutConfig';

/**
 * Simple, direct Observable Plot generation
 * No complex pipeline - just analyze fields and generate chart directly
 */
export function generatePlot(context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult } = context;

  // Handle empty fields
  if (xFields.length === 0 && yFields.length === 0) {
    return createMessageChart('Drag fields to the axes to create a chart.');
  }

  // Check if we have any data
  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return createMessageChart('No data available.');
  }

  // Analyze fields to determine chart type
  const analysis = analyzeFields(xFields, yFields);
  
  // We allow dimension-only continuous charts (tick-strip/scatter), so do not require measures here.

  try {
    // Attempt faceting by discrete fields (dimensions or measures) on top of a base plot
    const faceted = generateFacetedGridIfNeeded(context);
    if (faceted) return faceted;

    // Multi-measure on the same axis -> grid of bar charts (preferred over cartesian pairing)
    if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
      return multiMeasureBarChart(context);
    }
    
    // If both axes have at least one candidate (measure or dimension), build a cartesian pairing grid
    const xCandidates = [...analysis.xMeasures, ...analysis.xDimensions];
    const yCandidates = [...analysis.yMeasures, ...analysis.yDimensions];

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      return generateCartesianGrid(context, analysis, xCandidates, yCandidates);
    }

    // Otherwise, generate single chart or simple multi on one axis
    const result = generateChartOptions(analysis, context);
    return result;

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Simple field analysis - no complex classification
 */
interface FieldAnalysis {
  hasMeasure: boolean;
  hasXMeasure: boolean;
  hasYMeasure: boolean;
  hasXDimension: boolean;
  hasYDimension: boolean;
  xMeasures: any[];
  yMeasures: any[];
  xDimensions: any[];
  yDimensions: any[];
  totalMeasures: number;
  isMultiMeasure: boolean;
  hasMixedAxes: boolean; // Measures on both X and Y axes
}

function analyzeFields(xFields: any[], yFields: any[]): FieldAnalysis {
  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xDimensions = xFields.filter(f => f.type === 'dimension');
  const yDimensions = yFields.filter(f => f.type === 'dimension');
  
  const totalMeasures = xMeasures.length + yMeasures.length;

  return {
    hasMeasure: totalMeasures > 0,
    hasXMeasure: xMeasures.length > 0,
    hasYMeasure: yMeasures.length > 0,
    hasXDimension: xDimensions.length > 0,
    hasYDimension: yDimensions.length > 0,
    xMeasures,
    yMeasures,
    xDimensions,
    yDimensions,
    totalMeasures,
    isMultiMeasure: totalMeasures > 1,
    hasMixedAxes: xMeasures.length > 0 && yMeasures.length > 0, // Measures on both axes
  };
}

/**
 * Generate scatter plot for measures on both X and Y axes
 */
function generateScatterPlot(analysis: FieldAnalysis, context: ChartGenerationContext): Plot.PlotOptions {
  const { queryResult } = context;
  const data = queryResult?.rows || [];
  
  // Get the first measure from each axis (for simplicity)
  const xMeasure = analysis.xMeasures[0];
  const yMeasure = analysis.yMeasures[0];
  
  // Generate column names for measures
  const xFieldForName = { ...xMeasure, aggregation: xMeasure.aggregation || 'sum' };
  const yFieldForName = { ...yMeasure, aggregation: yMeasure.aggregation || 'sum' };
  const xColumnName = getResultColumnName(xFieldForName);
  const yColumnName = getResultColumnName(yFieldForName);
  
  return {
    width: 400,
    height: 300,
    x: {
      label: xColumnName,
      grid: true,
    },
    y: {
      label: yColumnName,
      grid: true,
    },
    marks: [
      Plot.dot(data, {
        x: xColumnName,
        y: yColumnName,
        fill: "steelblue",
        r: 4, // Fixed radius for dots
      }),
      Plot.ruleX([0]),
      Plot.ruleY([0])
    ]
  };
}

/**
 * Generate single chart options based on simple field analysis
 */
function generateChartOptions(analysis: FieldAnalysis, context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult } = context;
  const data = queryResult.rows;

  // 1) Multi-measure path is already handled earlier

  // 2) Single continuous measure on one axis -> bar chart
  // Distinguish discrete vs continuous dimension on the opposite axis
  const xDims = analysis.xDimensions || [];
  const yDims = analysis.yDimensions || [];
  // Early: measure with no dimensions on the opposite axis → single-bar chart
  if (analysis.hasXMeasure && !analysis.hasYMeasure && yDims.length === 0) {
    return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
  }
  if (analysis.hasYMeasure && !analysis.hasXMeasure && xDims.length === 0) {
    return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
  }
  const xDiscreteDims = xDims.filter((d: any) => d.flavour === 'discrete');
  const yDiscreteDims = yDims.filter((d: any) => d.flavour === 'discrete');
  const xContinuousDims = xDims.filter((d: any) => d.flavour === 'continuous');
  const yContinuousDims = yDims.filter((d: any) => d.flavour === 'continuous');

  if (analysis.hasXMeasure && !analysis.hasYMeasure) {
    // Measure on X; if Y has discrete dims only → barX; if Y has continuous dim → line
    if (yContinuousDims.length > 0) {
      const yDimCol = yContinuousDims[0].columnName;
      const xMeasure = analysis.xMeasures[0];
      const xMeasureCol = getResultColumnName({ ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as any);
      return {
        library: 'observable-plot',
        options: lineChart(data, yDimCol, xMeasureCol, { x: yDimCol, y: xMeasureCol }),
        layout: { type: 'single' },
      };
    }
    if (yDiscreteDims.length > 0 || yDims.length > 0) {
      return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
    }
  }

  if (analysis.hasYMeasure && !analysis.hasXMeasure) {
    // Measure on Y; if X has discrete dims only → barY; if X has continuous dim → line
    if (xContinuousDims.length > 0) {
      const xDimCol = xContinuousDims[0].columnName;
      const yMeasure = analysis.yMeasures[0];
      const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
      return {
        library: 'observable-plot',
        options: lineChart(data, xDimCol, yMeasureCol, { x: xDimCol, y: yMeasureCol }),
        layout: { type: 'single' },
      };
    }
    if (xDiscreteDims.length > 0 || xDims.length > 0) {
      return { library: 'observable-plot', options: barChart(context), layout: { type: 'single' } };
    }
  }

  // 3) Continuous dimension only (single) -> tick-strip
  const singleXDim =
    analysis.hasXDimension && xContinuousDims.length === 1 && yDims.length === 0;
  const singleYDim =
    analysis.hasYDimension && yContinuousDims.length === 1 && xDims.length === 0;
  if (singleXDim) {
    const dimCol = analysis.xDimensions[0].columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'x', dimCol), layout: { type: 'single' } };
  }
  if (singleYDim) {
    const dimCol = analysis.yDimensions[0].columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'y', dimCol), layout: { type: 'single' } };
  }

  // 4) Continuous dimension on both axes -> scatter
  const bothDims = analysis.hasXDimension && analysis.hasYDimension && analysis.xDimensions.length > 0 && analysis.yDimensions.length > 0;
  if (bothDims && !analysis.hasMeasure) {
    const xDimCol = analysis.xDimensions[0].columnName;
    const yDimCol = analysis.yDimensions[0].columnName;
    return {
      library: 'observable-plot',
      options: scatterChart(data, xDimCol, yDimCol, { x: xDimCol, y: yDimCol }),
      layout: { type: 'single' },
    };
  }

  // 5) Continuous measure on one axis + continuous dimension on the other -> line chart
  const hasMeasureOnlyX = analysis.hasXMeasure && !analysis.hasYMeasure && analysis.hasYDimension;
  const hasMeasureOnlyY = analysis.hasYMeasure && !analysis.hasXMeasure && analysis.hasXDimension;
  if (hasMeasureOnlyX) {
    // measure on X vs dimension on Y -> line with x=dimension, y=measure (so line goes along dimension)
    const xMeasure = analysis.xMeasures[0];
    const yDim = analysis.yDimensions[0];
    const xMeasureCol = getResultColumnName({ ...xMeasure, aggregation: xMeasure.aggregation || 'sum' } as any);
    const yDimCol = yDim.columnName;
    return {
      library: 'observable-plot',
      options: lineChart(data, yDimCol, xMeasureCol, { x: yDimCol, y: xMeasureCol }),
      layout: { type: 'single' },
    };
  }
  if (hasMeasureOnlyY) {
    const yMeasure = analysis.yMeasures[0];
    const xDim = analysis.xDimensions[0];
    const yMeasureCol = getResultColumnName({ ...yMeasure, aggregation: yMeasure.aggregation || 'sum' } as any);
    const xDimCol = xDim.columnName;
    return {
      library: 'observable-plot',
      options: lineChart(data, xDimCol, yMeasureCol, { x: xDimCol, y: yMeasureCol }),
      layout: { type: 'single' },
    };
  }

  // 6) Multiple continuous dimensions on the same axis -> multiple charts (CSS grid)
  const multiXDim = analysis.hasXDimension && analysis.xDimensions.length > 1 && !analysis.hasYDimension && !analysis.hasMeasure;
  const multiYDim = analysis.hasYDimension && analysis.yDimensions.length > 1 && !analysis.hasXDimension && !analysis.hasMeasure;
  if (multiXDim) {
    const plots = analysis.xDimensions.map((dim: any, i: number) => ({
      id: `x-dim-${i}`,
      title: dim.columnName,
      position: { row: 0, col: i },
      options: tickStrip(context, 'x', dim.columnName),
    }));
    return {
      library: 'observable-plot',
      plots,
      layout: { type: 'grid', columns: plots.length, rows: 1, columnSizes: Array.from({ length: plots.length }, () => 'fr'), rowSizes: ['fr'] },
    };
  }
  if (multiYDim) {
    const plots = analysis.yDimensions.map((dim: any, i: number) => ({
      id: `y-dim-${i}`,
      title: dim.columnName,
      position: { row: i, col: 0 },
      options: tickStrip(context, 'y', dim.columnName),
    }));
    return {
      library: 'observable-plot',
      plots,
      layout: { type: 'grid', columns: 1, rows: plots.length, columnSizes: ['fr'], rowSizes: Array.from({ length: plots.length }, () => 'fr') },
    };
  }

  // Fallback to single message
  return {
    library: 'observable-plot',
    options: {
      marks: [
        Plot.text(['Unsupported field combination'], { frameAnchor: 'middle', fontSize: 14, fill: 'gray' }),
      ],
    },
    layout: { type: 'single' },
  };
}

/**
 * Build a cartesian pairing grid between xCandidates and yCandidates.
 * - If both are measures → scatter by their measure columns
 * - If one is measure and other is dimension → line chart
 * - If both are dimensions → scatter
 * Uses CSS grid with positions. For now, non-bar charts use 'fr' sizing.
 */
function generateCartesianGrid(
  context: ChartGenerationContext,
  analysis: FieldAnalysis,
  xCandidates: any[],
  yCandidates: any[]
): PlotResult {
  const { queryResult } = context;
  const data = queryResult.rows;

  // Compute shared domains for any measures used in the grid
  const sharedMeasureDomains = computeSharedMeasureDomains(data, xCandidates, yCandidates);

  const plots: Array<{
    id: string;
    title: string;
    options: Plot.PlotOptions;
    position: { row: number; col: number };
  }> = [];

  for (let r = 0; r < yCandidates.length; r++) {
    for (let c = 0; c < xCandidates.length; c++) {
      const xField = xCandidates[c];
      const yField = yCandidates[r];

      const xIsMeasure = xField.type === 'measure';
      const yIsMeasure = yField.type === 'measure';
      const xLabel = xIsMeasure
        ? getResultColumnName({ ...xField, aggregation: xField.aggregation || 'sum' })
        : xField.columnName;
      const yLabel = yIsMeasure
        ? getResultColumnName({ ...yField, aggregation: yField.aggregation || 'sum' })
        : yField.columnName;

      let options: Plot.PlotOptions;
      let title = `${yLabel} vs ${xLabel}`;

      if (xIsMeasure && yIsMeasure) {
        // measure vs measure → scatter
        options = scatterChart(data, xLabel, yLabel, { x: xLabel, y: yLabel });
        // Apply shared domains for both measures
        const xDomain = sharedMeasureDomains[xLabel];
        const yDomain = sharedMeasureDomains[yLabel];
        if (xDomain) {
          options.x = { ...(options.x || {}), domain: xDomain } as any;
        }
        if (yDomain) {
          options.y = { ...(options.y || {}), domain: yDomain } as any;
        }
      } else if (xIsMeasure && !yIsMeasure) {
        // measure on x, dimension on y → if dim continuous: line; if dim discrete: horizontal bars
        const yDimIsContinuous = yField.flavour === 'continuous';
        if (yDimIsContinuous) {
          options = lineChart(data, yLabel, xLabel, { x: yLabel, y: xLabel });
          const xDomain = sharedMeasureDomains[xLabel];
          if (xDomain) options.x = { ...(options.x || {}), domain: xDomain } as any;
        } else {
          // Horizontal bars
          const categoryCount = new Set(data.map((row: any) => row[yLabel])).size;
          const heightPx = Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX);
          options = {
            x: { label: xLabel, grid: true, domain: sharedMeasureDomains[xLabel] },
            y: { label: yLabel },
            height: heightPx,
            marks: [
              Plot.ruleX([0]),
              Plot.barX(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR }),
            ],
          } as Plot.PlotOptions;
        }
      } else if (!xIsMeasure && yIsMeasure) {
        // dimension on x, measure on y → if dim continuous: line; if dim discrete: vertical bars
        const xDimIsContinuous = xField.flavour === 'continuous';
        if (xDimIsContinuous) {
          options = lineChart(data, xLabel, yLabel, { x: xLabel, y: yLabel });
          const yDomain = sharedMeasureDomains[yLabel];
          if (yDomain) options.y = { ...(options.y || {}), domain: yDomain } as any;
        } else {
          // Vertical bars
          const categoryCount = new Set(data.map((row: any) => row[xLabel])).size;
          const widthPx = Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX);
          options = {
            y: { label: yLabel, grid: true, domain: sharedMeasureDomains[yLabel] },
            x: { label: xLabel },
            width: widthPx,
            marks: [
              Plot.ruleY([0]),
              Plot.barY(data, { x: xLabel, y: yLabel, fill: DEFAULT_CHART_COLOR }),
            ],
          } as Plot.PlotOptions;
        }
      } else {
        // both dimensions → scatter
        options = scatterChart(data, xLabel, yLabel, { x: xLabel, y: yLabel });
      }

      plots.push({ id: `cell-${r}-${c}`, title, options, position: { row: r, col: c } });
    }
  }

  return {
    library: 'observable-plot',
    plots,
    sharedDomains: { byMeasure: sharedMeasureDomains as any },
    layout: {
      type: 'grid',
      columns: xCandidates.length,
      rows: yCandidates.length,
      columnSizes: Array.from({ length: xCandidates.length }, () => 'fr'),
      rowSizes: Array.from({ length: yCandidates.length }, () => 'fr'),
    },
  };
}

/**
 * Facet planner: If there are discrete fields present, facet the base chart by up to 2 fields
 * (first → rows, second → columns). For each facet combination, we regenerate the base chart
 * on the filtered subset. Discrete fields do not directly influence base chart type, except
 * for bar charts where a category axis can be injected if needed (see below).
 */
function generateFacetedGridIfNeeded(context: ChartGenerationContext): PlotResult | null {
  const { xFields, yFields, queryResult } = context;
  const anyDiscrete = xFields.some((f) => f.flavour === 'discrete') || yFields.some((f) => f.flavour === 'discrete');
  if (!anyDiscrete) return null;

  // Determine if a category axis injection is needed for bar charts
  // Case A: measures on Y, and X contains only discrete fields → category on X (last discrete)
  // Case B: measures on X, and Y contains only discrete fields → category on Y (last discrete)
  const xHasContinuous = xFields.some((f) => f.flavour === 'continuous');
  const yHasContinuous = yFields.some((f) => f.flavour === 'continuous');
  const hasYMeasure = yFields.some((f) => f.type === 'measure' && f.flavour === 'continuous');
  const hasXMeasure = xFields.some((f) => f.type === 'measure' && f.flavour === 'continuous');

  let categoryAxis: 'x' | 'y' | null = null;
  if (!xHasContinuous && hasYMeasure) categoryAxis = 'x';
  else if (!yHasContinuous && hasXMeasure) categoryAxis = 'y';

  // Choose up to two discrete fields for faceting, excluding the category field if chosen
  let excludedCategoryFieldId: string | null = null;
  if (categoryAxis) {
    const axisFields = categoryAxis === 'x' ? xFields : yFields;
    const lastDiscrete = [...axisFields].filter((f) => f.flavour === 'discrete').slice(-1)[0];
    if (lastDiscrete) excludedCategoryFieldId = lastDiscrete.id;
  }

  // Axis-aware facet orientation:
  // - Discrete on Y → vertical faceting (rows)
  // - Discrete on X → horizontal faceting (columns)
  const xDiscrete = xFields.filter((f) => f.flavour === 'discrete' && f.id !== excludedCategoryFieldId);
  const yDiscrete = yFields.filter((f) => f.flavour === 'discrete' && f.id !== excludedCategoryFieldId);

  const rowFacetField = yDiscrete[0] || null;
  const colFacetField = xDiscrete[0] || null;
  if (!rowFacetField && !colFacetField) return null; // no faceting needed after excluding category

  // Build unique values for facet fields
  const rowValues = rowFacetField ? uniqueValuesForField(queryResult.rows, rowFacetField) : [null];
  const colValues = colFacetField ? uniqueValuesForField(queryResult.rows, colFacetField) : [null];

  // Compute shared measure domains across whole data for comparability
  const allMeasures = [...xFields, ...yFields].filter((f: any) => f.type === 'measure' && f.flavour === 'continuous');
  const xCandidates = allMeasures; // reusing computeSharedMeasureDomains signature convenience
  const yCandidates = allMeasures;
  const sharedMeasureDomains = computeSharedMeasureDomains(queryResult.rows, xCandidates as any[], yCandidates as any[]);

  const combinedPlots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }> = [];

  // Determine base layout by generating one sample facet (first values)
  const sampleRows = filterRowsByFacet(queryResult.rows, rowFacetField, rowValues[0], colFacetField, colValues[0]);
  const baseSpec = buildBaseSpecForDataSubset(context, categoryAxis, excludedCategoryFieldId, sampleRows, sharedMeasureDomains);
  const baseCols = baseSpec.columns;
  const baseRows = baseSpec.rows;

  for (let r = 0; r < rowValues.length; r++) {
    for (let c = 0; c < colValues.length; c++) {
      const subset = filterRowsByFacet(queryResult.rows, rowFacetField, rowValues[r], colFacetField, colValues[c]);
      const facetSpec = buildBaseSpecForDataSubset(context, categoryAxis, excludedCategoryFieldId, subset, sharedMeasureDomains);

      // Offset plots into the correct grid position
      facetSpec.plots.forEach((p) => {
        combinedPlots.push({
          id: `${p.id}-r${r}-c${c}`,
          title: p.title,
          options: p.options,
          position: { row: r * baseRows + p.position.row, col: c * baseCols + p.position.col },
        });
      });
    }
  }

  return {
    library: 'observable-plot',
    plots: combinedPlots,
    sharedDomains: { byMeasure: sharedMeasureDomains as any },
    layout: {
      type: 'grid',
      columns: baseCols * colValues.length,
      rows: baseRows * rowValues.length,
      columnSizes: Array.from({ length: baseCols * colValues.length }, () => 'fr'),
      rowSizes: Array.from({ length: baseRows * rowValues.length }, () => 'fr'),
    },
  };
}

function getFieldColumnName(field: Field): string {
  if (field.type === 'measure') {
    const agg = field.aggregation || 'sum';
    return getResultColumnName({ ...field, aggregation: agg } as any);
  }
  return field.columnName;
}

function uniqueValuesForField(rows: any[], field: Field): any[] {
  const col = getFieldColumnName(field);
  const seen = new Set<any>();
  const values: any[] = [];
  rows.forEach((row) => {
    const v = row[col];
    if (!seen.has(v)) {
      seen.add(v);
      values.push(v);
    }
  });
  return values;
}

function filterRowsByFacet(
  rows: any[],
  rowField: Field | null,
  rowValue: any,
  colField: Field | null,
  colValue: any
): any[] {
  return rows.filter((row) => {
    if (rowField) {
      const col = getFieldColumnName(rowField);
      if (row[col] !== rowValue) return false;
    }
    if (colField) {
      const col = getFieldColumnName(colField);
      if (row[col] !== colValue) return false;
    }
    return true;
  });
}

type BaseSpec = {
  plots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }>;
  columns: number;
  rows: number;
};

function buildBaseSpecForDataSubset(
  context: ChartGenerationContext,
  categoryAxis: 'x' | 'y' | null,
  excludedCategoryFieldId: string | null,
  subsetRows: any[],
  sharedMeasureDomains?: Record<string, [number, number]>
): BaseSpec {
  const { queryResult, xFields, yFields } = context;

  // Inject category axis pseudo-dimension when required for bars
  let localXFields = xFields.slice();
  let localYFields = yFields.slice();
  if (categoryAxis) {
    const axisFields = categoryAxis === 'x' ? localXFields : localYFields;
    const lastDiscrete = [...axisFields].filter((f) => f.flavour === 'discrete').slice(-1)[0];
    if (lastDiscrete) {
      const colName = getFieldColumnName(lastDiscrete);
      const pseudoDim: any = {
        ...lastDiscrete,
        id: `${lastDiscrete.id}__as_dim`,
        type: 'dimension',
        aggregation: undefined,
        columnName: colName,
      };
      if (categoryAxis === 'x') {
        localXFields = [...localXFields, pseudoDim];
      } else {
        localYFields = [...localYFields, pseudoDim];
      }
    }
  }

  const localContext: ChartGenerationContext = {
    ...context,
    xFields: localXFields,
    yFields: localYFields,
    queryResult: { ...queryResult, rows: subsetRows },
  };

  const baseResult = baseGeneratePlot(localContext);

  // Apply shared domains by measure if provided
  if (sharedMeasureDomains) {
    const applyDomains = (opts: Plot.PlotOptions) => {
      // We don't know which axis hosts which measure here; domains will be applied later where relevant
      // in generateCartesianGrid. For bars/lines/scatters we already set in their creators when needed.
      return opts;
    };
    if (baseResult.options) {
      baseResult.options = applyDomains(baseResult.options);
    }
    if (baseResult.plots) {
      baseResult.plots = baseResult.plots.map((p) => ({ ...p, options: applyDomains(p.options) }));
    }
  }

  // Normalize to BaseSpec
  if (baseResult.plots && baseResult.plots.length > 0) {
    const cols = baseResult.layout?.columns || 1;
    const rows = baseResult.layout?.rows || 1;
    const plots = baseResult.plots.map((p, i) => ({
      id: p.id || `p-${i}`,
      title: p.title,
      options: p.options,
      position: p.position || { row: 0, col: i },
    }));
    return { plots, columns: cols, rows };
  }

  // Single options → single plot
  if (baseResult.options) {
    return {
      plots: [{ id: 'p-0', title: '', options: baseResult.options, position: { row: 0, col: 0 } }],
      columns: 1,
      rows: 1,
    };
  }

  // Fallback empty
  return { plots: [], columns: 1, rows: 1 };
}

function baseGeneratePlot(context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult } = context;
  const analysis = analyzeFields(xFields, yFields);
  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return createMessageChart('No data available.');
  }

  // Mixed-axis measures → scatter
  if (analysis.hasMixedAxes) {
    const plotOptions = generateScatterPlot(analysis, context);
    return { library: 'observable-plot', options: plotOptions, layout: { type: 'single' } };
  }

  // Multi-measure per axis → our existing bar grid
  if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
    try { return multiMeasureBarChart(context); } catch { /* fall through */ }
  }

  // Fallback to single-chart rules
  const single = generateChartOptions(analysis, context);
  return single;
}
/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
function computeSharedMeasureDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[]
): Record<string, [number, number]> {
  const measures: string[] = [];

  const addMeasure = (field: any) => {
    if (field?.type === 'measure') {
      const name = getResultColumnName({ ...field, aggregation: field.aggregation || 'sum' } as any);
      if (!measures.includes(name)) measures.push(name);
    }
  };

  xCandidates.forEach(addMeasure);
  yCandidates.forEach(addMeasure);

  const domains: Record<string, [number, number]> = {};
  measures.forEach((measureName) => {
    const values = data
      .map((row) => row[measureName])
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lower = Math.min(0, min);
    const upper = max <= 0 ? 0 : max * 1.1; // clamp to 0 if non-positive
    domains[measureName] = [lower, upper];
  });

  return domains;
}

/**
 * Create a simple message chart
 */
function createMessageChart(message: string): PlotResult {
  return {
    library: 'observable-plot',
    options: {
      marks: [
        Plot.text([message], {
          frameAnchor: "middle",
          fontSize: 14,
          fill: "gray"
        })
      ]
    },
    layout: { type: 'single' }
  };
}