import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult } from './types';
import { barChart } from './chartTypes/barChart';
import { multiMeasureBarChart } from './chartTypes/multiMeasureBarChart';
import { getResultColumnName } from '../utils/fieldUtils';
import { tickStrip } from './chartTypes/tickStrip';
import { lineChart } from './chartTypes/lineChart';
import { scatterChart } from './chartTypes/scatterChart';
import { generateChartOptions as genChartOptionsRule, generateScatterPlot } from './rules/chartRules';
import { Field } from '../types';
import { getFieldColumnName } from './helpers/fields';
import { computeSharedMeasureDomains } from './domains/measureDomains';
import { computeSharedNumericDomains } from './domains/numericDomains';
import { FieldAnalysis, analyzeFields } from './analysis/fieldAnalysis';
import { DEFAULT_CHART_COLOR, BAR_STEP_PX } from '../config/chartLayoutConfig';
import { generateCartesianPlots } from './grid/cartesianGrid';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';

/**
 * Simple, direct Observable Plot generation
 * No complex pipeline - just analyze fields and generate chart directly
 */
export function generatePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
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
    // Always attempt faceting to ensure consistent behavior (even for single charts)
    const faceted = generateFacetedGridIfNeeded(context);
    if (faceted) return faceted;

    // Multi-measure on the same axis -> grid of bar charts (preferred over cartesian pairing)
    if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
      return multiMeasureBarChart(context);
    }
    
    // If both axes have at least one candidate (measure or dimension), build a cartesian pairing grid
    // This includes single charts as 1x1 grids for unified domain handling
    const xCandidates = [...analysis.xMeasures, ...analysis.xDimensions];
    const yCandidates = [...analysis.yMeasures, ...analysis.yDimensions];

    if (xCandidates.length > 0 && yCandidates.length > 0) {
      return generateCartesianGrid(context, analysis, xCandidates, yCandidates, overrides);
    }

    // Otherwise, generate single chart or simple multi on one axis (rare edge cases)
    const result = genChartOptionsRule(analysis, context);
    return result;

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Simple field analysis - no complex classification
 */
// moved to analysis/fieldAnalysis.ts

/**
 * Generate scatter plot for measures on both X and Y axes
 */
// moved to rules/chartRules.ts

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
    return { library: 'observable-plot', options: tickStrip(context, 'x', dimCol, undefined), layout: { type: 'single' } };
  }
  if (singleYDim) {
    const dimCol = analysis.yDimensions[0].columnName;
    return { library: 'observable-plot', options: tickStrip(context, 'y', dimCol, undefined), layout: { type: 'single' } };
  }

  // 4) Continuous dimension on both axes -> scatter
  const bothDims = analysis.hasXDimension && analysis.hasYDimension && analysis.xDimensions.length > 0 && analysis.yDimensions.length > 0;
  if (bothDims && !analysis.hasMeasure) {
    const xDimCol = analysis.xDimensions[0].columnName;
    const yDimCol = analysis.yDimensions[0].columnName;
    const result: PlotResult = {
      library: 'observable-plot',
      options: scatterChart(data, xDimCol, yDimCol, { x: xDimCol, y: yDimCol }),
      layout: { type: 'single' },
    };
    return result;
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
  xCandidates: Field[],
  yCandidates: Field[],
  overrides?: ChartTypeOverrides
): PlotResult {
  const { queryResult } = context;
  const data = queryResult.rows;

  // Compute shared domains for any measures used in the grid
  const sharedMeasureDomains = computeSharedMeasureDomains(data, xCandidates, yCandidates);
  
  const plots = generateCartesianPlots(data, xCandidates, yCandidates, sharedMeasureDomains, overrides);

  // Derive per-column width and per-row height from plots' options when available
  const columnSizes: Array<number | 'fr'> = Array.from({ length: xCandidates.length }, (_, c) => {
    const sample = plots.find((p) => p.position.col === c);
    const w = (sample as any)?.options?.width;
    return typeof w === 'number' ? w : 'fr';
  });
  const rowSizes: Array<number | 'fr'> = Array.from({ length: yCandidates.length }, (_, r) => {
    const sample = plots.find((p) => p.position.row === r);
    const h = (sample as any)?.options?.height;
    return typeof h === 'number' ? h : 'fr';
  });

  return {
    library: 'observable-plot',
    plots,
    sharedDomains: { byMeasure: sharedMeasureDomains as any },
    layout: {
      type: 'grid',
      columns: xCandidates.length,
      rows: yCandidates.length,
      columnSizes,
      rowSizes,
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
  
  // Always create a faceted structure for consistent behavior, even without discrete fields
  // This ensures single charts get the same Y-axis styling as multi-charts

  // Avoid faceting for tick-strip scenarios:
  // If there are no measures and exactly one axis has a continuous dimension
  // while the opposite axis has only discrete dimensions, we want a single
  // tick-strip with categories (not a faceted grid).
  const hasAnyMeasure = xFields.some((f) => f.type === 'measure') || yFields.some((f) => f.type === 'measure');
  if (!hasAnyMeasure) {
    const xContDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const yContDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const xDiscDims = xFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    const yDiscDims = yFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');

    const xTickScenario = xContDims.length === 1 && yContDims.length === 0 && yDiscDims.length > 0;
    const yTickScenario = yContDims.length === 1 && xContDims.length === 0 && xDiscDims.length > 0;
    if (xTickScenario || yTickScenario) {
      return null; // let single-chart rules build tick-strip with category
    }
  }

  // BAR CHART short-circuit: if exactly one side has a measure, render CSS bars per facet
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  const barOrientation: 'barX' | 'barY' | null = xMeasure && !yMeasure ? 'barX' : (!xMeasure && yMeasure ? 'barY' : null);
  let categoryAxis: 'x' | 'y' | null = barOrientation === 'barX' ? 'y' : (barOrientation === 'barY' ? 'x' : null);

  // Choose up to two discrete fields for faceting, excluding the category field if chosen
  let excludedCategoryFieldId: string | null = null;
  let sharedCategoryDomain: any[] | null = null;
  let categoryFieldCol: string | undefined;
  if (categoryAxis) {
    const axisFields = categoryAxis === 'x' ? xFields : yFields;
    const lastDiscrete = [...axisFields].filter((f) => f.flavour === 'discrete').slice(-1)[0];
    if (lastDiscrete) {
      excludedCategoryFieldId = lastDiscrete.id;
      categoryFieldCol = getFieldColumnName(lastDiscrete);
      sharedCategoryDomain = uniqueValuesForField(queryResult.rows, lastDiscrete);
    } else {
      // Fallback single category when none present
      sharedCategoryDomain = [' '];
    }
  }

  // Axis-aware facet orientation:
  // - Discrete on Y → vertical faceting (rows), allow multiple levels
  // - Discrete on X → horizontal faceting (columns), allow multiple levels
  const rowFacetFields = yFields.filter((f) => f.flavour === 'discrete' && f.id !== excludedCategoryFieldId);
  const colFacetFields = xFields.filter((f) => f.flavour === 'discrete' && f.id !== excludedCategoryFieldId);
  
  // BAR path: switch back to OP marks per cell (for exact alignment with axes)
  if (barOrientation && categoryAxis) {
    const measureField = barOrientation === 'barX' ? xMeasure! : yMeasure!;
    const measureName = getResultColumnName({ ...measureField, aggregation: (measureField as any).aggregation || 'sum' } as any);
    const allMeasures = [measureField];
    const sharedMeasureDomains = computeSharedMeasureDomains(queryResult.rows, allMeasures as any[], allMeasures as any[]);
    const valueDomain = sharedMeasureDomains[measureName] || [0, 1];

    // Choose facet fields excluding category
    const rowFacetFields = yFields.filter((f) => f.flavour === 'discrete' && (categoryAxis !== 'y' || f.id !== excludedCategoryFieldId));
    const colFacetFields = xFields.filter((f) => f.flavour === 'discrete' && (categoryAxis !== 'x' || f.id !== excludedCategoryFieldId));

    const rowValuesLevels = rowFacetFields.map((f) => uniqueValuesForField(queryResult.rows, f));
    const colValuesLevels = colFacetFields.map((f) => uniqueValuesForField(queryResult.rows, f));
    const rowCombos = buildFacetCombos(rowFacetFields, rowValuesLevels);
    const colCombos = buildFacetCombos(colFacetFields, colValuesLevels);
    const safeRowCombos = rowCombos.length > 0 ? rowCombos : [[]];
    const safeColCombos = colCombos.length > 0 ? colCombos : [[]];

    const combinedPlots: any[] = [];
    const categories = sharedCategoryDomain || [' '];
    const baseRowHeight = categoryAxis === 'y' ? Math.max(BAR_STEP_PX * 2, categories.length * BAR_STEP_PX) : 'fr';
    const baseColWidth = categoryAxis === 'x' ? Math.max(BAR_STEP_PX * 2, categories.length * BAR_STEP_PX) : 'fr';

    for (let r = 0; r < safeRowCombos.length; r++) {
      for (let c = 0; c < safeColCombos.length; c++) {
        const subset = filterRowsByFacets(queryResult.rows, rowFacetFields, safeRowCombos[r], colFacetFields, safeColCombos[c]);
        // Use Observable Plot bar marks to ensure pixel-perfect alignment with axis ticks
        const options: Plot.PlotOptions = barOrientation === 'barX'
          ? {
              x: { label: measureName, grid: true, domain: valueDomain },
              y: { label: categoryFieldCol || ' ', type: 'band' as any, domain: categories as any },
              marks: [
                Plot.barX(subset, { x: measureName, y: categoryFieldCol || (() => categories[0]), fill: DEFAULT_CHART_COLOR }),
                Plot.ruleX([0])
              ]
            }
          : {
              y: { label: measureName, grid: true, domain: valueDomain },
              x: { label: categoryFieldCol || ' ', type: 'band' as any, domain: categories as any },
              marks: [
                Plot.barY(subset, { y: measureName, x: categoryFieldCol || (() => categories[0]), fill: DEFAULT_CHART_COLOR }),
                Plot.ruleY([0])
              ]
            } as any;

        combinedPlots.push({ id: `facet-${r}-${c}`, title: '', options, position: { row: r, col: c } });
      }
    }

    const columns = safeColCombos.length;
    const rows = safeRowCombos.length;
    const columnSizes = Array.from({ length: columns }, () => baseColWidth as any);
    const rowSizes = Array.from({ length: rows }, () => baseRowHeight as any);

    return {
      library: 'observable-plot',
      plots: combinedPlots,
      layout: {
        type: 'grid',
        columns,
        rows,
        columnSizes,
        rowSizes,
      },
      facetLabels: {
        rowsLevels: rowFacetFields.length > 0 ? rowFacetFields.map((f, i) => ({ fieldLabel: getFieldColumnName(f), values: rowValuesLevels[i] })) : undefined,
        colsLevels: colFacetFields.length > 0 ? colFacetFields.map((f, i) => ({ fieldLabel: getFieldColumnName(f), values: colValuesLevels[i] })) : undefined,
        groupSpan: { columnsPerFacet: 1, rowsPerFacet: 1 },
        spans: { baseCols: 1, baseRows: 1, columns: [], rows: [] },
      },
    };
  }

  // Values per level
  const rowValuesLevels = rowFacetFields.map((f) => uniqueValuesForField(queryResult.rows, f));
  const colValuesLevels = colFacetFields.map((f) => uniqueValuesForField(queryResult.rows, f));

  // Build all combinations per side
  const rowCombos = buildFacetCombos(rowFacetFields, rowValuesLevels);
  const colCombos = buildFacetCombos(colFacetFields, colValuesLevels);
  const safeRowCombos = rowCombos.length > 0 ? rowCombos : [[]];
  const safeColCombos = colCombos.length > 0 ? colCombos : [[]];

  // Compute shared measure domains across whole data for comparability
  const allMeasures = [...xFields, ...yFields].filter((f: any) => f.type === 'measure' && f.flavour === 'continuous');
  const xCandidates = allMeasures; // reusing computeSharedMeasureDomains signature convenience
  const yCandidates = allMeasures;
  const sharedMeasureDomains = computeSharedMeasureDomains(queryResult.rows, xCandidates as any[], yCandidates as any[]);
  // Compute shared numeric domains for continuous dimensions and measures (by column/alias)
  const sharedNumericDomains = computeSharedNumericDomains(queryResult.rows, xFields as any[], yFields as any[]);

  const combinedPlots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }> = [];

  // Determine base layout by generating one sample facet (first values)
  const sampleRows = filterRowsByFacets(queryResult.rows, rowFacetFields, safeRowCombos[0], colFacetFields, safeColCombos[0]);
  const baseSpec = buildBaseSpecForDataSubset(
    context,
    categoryAxis,
    excludedCategoryFieldId,
    sampleRows,
    sharedMeasureDomains,
    sharedNumericDomains,
    // pass top-level facet fields (we remove all of them below when building local context)
    rowFacetFields[0] || null,
    colFacetFields[0] || null,
    sharedCategoryDomain || undefined
  );
  const baseCols = baseSpec.columns;
  const baseRows = baseSpec.rows;

  for (let r = 0; r < safeRowCombos.length; r++) {
    for (let c = 0; c < safeColCombos.length; c++) {
      const subset = filterRowsByFacets(queryResult.rows, rowFacetFields, safeRowCombos[r], colFacetFields, safeColCombos[c]);
      const facetSpec = buildBaseSpecForDataSubset(
        context,
        categoryAxis,
        excludedCategoryFieldId,
        subset,
        sharedMeasureDomains,
        sharedNumericDomains,
        rowFacetFields[0] || null,
        colFacetFields[0] || null,
        sharedCategoryDomain || undefined
      );

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
      columns: baseCols * safeColCombos.length,
      rows: baseRows * safeRowCombos.length,
      columnSizes: baseSpec.columnSizes && baseSpec.columnSizes.length > 0
        ? Array.from({ length: baseCols * safeColCombos.length }, (_, idx) => baseSpec.columnSizes![idx % baseSpec.columnSizes!.length])
        : Array.from({ length: baseCols * safeColCombos.length }, () => 'fr'),
      rowSizes: baseSpec.rowSizes && baseSpec.rowSizes.length > 0
        ? Array.from({ length: baseRows * safeRowCombos.length }, (_, idx) => baseSpec.rowSizes![idx % baseSpec.rowSizes!.length])
        : Array.from({ length: baseRows * safeRowCombos.length }, () => 'fr'),
    },
    facetLabels: {
      rowsLevels: rowFacetFields.length > 0 ? rowFacetFields.map((f, i) => ({ fieldLabel: getFieldColumnName(f), values: rowValuesLevels[i] })) : undefined,
      colsLevels: colFacetFields.length > 0 ? colFacetFields.map((f, i) => ({ fieldLabel: getFieldColumnName(f), values: colValuesLevels[i] })) : undefined,
      groupSpan: { columnsPerFacet: baseCols, rowsPerFacet: baseRows },
      spans: {
        baseCols,
        baseRows,
        columns: computeLevelSpans(colFacetFields, baseCols),
        rows: computeLevelSpans(rowFacetFields, baseRows),
      },
    }
  };
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

function filterRowsByFacets(
  rows: any[],
  rowFields: Field[],
  rowValues: any[],
  colFields: Field[],
  colValues: any[]
): any[] {
  return rows.filter((row) => {
    for (let i = 0; i < rowFields.length; i++) {
      const f = rowFields[i];
      const v = rowValues[i];
      const col = getFieldColumnName(f);
      if (v !== undefined && row[col] !== v) return false;
    }
    for (let j = 0; j < colFields.length; j++) {
      const f = colFields[j];
      const v = colValues[j];
      const col = getFieldColumnName(f);
      if (v !== undefined && row[col] !== v) return false;
    }
    return true;
  });
}

function buildFacetCombos(fields: Field[], valuesLevels: any[][]): any[][] {
  if (fields.length === 0) return [];
  const result: any[][] = [];
  const helper = (level: number, acc: any[]) => {
    if (level === fields.length) {
      result.push(acc.slice());
      return;
    }
    const vals = valuesLevels[level] || [];
    for (let i = 0; i < vals.length; i++) {
      acc.push(vals[i]);
      helper(level + 1, acc);
      acc.pop();
    }
  };
  helper(0, []);
  return result;
}

function computeLevelSpans(fields: Field[], base: number): number[] {
  // Each level label should span all inner levels and base plots
  if (fields.length === 0) return [];
  const spans: number[] = [];
  for (let i = 0; i < fields.length; i++) {
    // For now, each level spans the full base; consumer may refine when nested grids are used
    spans.push(base);
  }
  return spans;
}

type BaseSpec = {
  plots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }>;
  columns: number;
  rows: number;
  columnSizes?: Array<number | 'fr'>;
  rowSizes?: Array<number | 'fr'>;
};

function buildBaseSpecForDataSubset(
  context: ChartGenerationContext,
  categoryAxis: 'x' | 'y' | null,
  excludedCategoryFieldId: string | null,
  subsetRows: any[],
  sharedMeasureDomains?: Record<string, [number, number]>,
  sharedNumericDomains?: Record<string, [number, number]>,
  rowFacetField?: Field | null,
  colFacetField?: Field | null,
  sharedCategoryDomain?: any[]
): BaseSpec {
  const { queryResult, xFields, yFields } = context;

  // Filter out discrete fields that are used for faceting (not category axis)
  let localXFields = xFields.filter(f => f.id !== excludedCategoryFieldId && (!colFacetField || f.id !== colFacetField.id));
  let localYFields = yFields.filter(f => f.id !== excludedCategoryFieldId && (!rowFacetField || f.id !== rowFacetField.id));
  
  // Inject category axis pseudo-dimension when required for bars
  if (categoryAxis && excludedCategoryFieldId) {
    // Use the original context fields to locate the category field by id
    const axisOriginal = categoryAxis === 'x' ? xFields : yFields;
    const catField = axisOriginal.find((f) => f.id === excludedCategoryFieldId);
    if (catField) {
      const colName = getFieldColumnName(catField);
      const pseudoDim: any = {
        ...catField,
        id: `${catField.id}__as_dim`,
        type: 'dimension',
        aggregation: undefined,
        columnName: colName,
      };
      if (categoryAxis === 'x') {
        localXFields = [pseudoDim, ...localXFields];
      } else {
        localYFields = [pseudoDim, ...localYFields];
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
  if (sharedMeasureDomains || sharedNumericDomains) {
    const applyDomains = (opts: Plot.PlotOptions) => {
      const xDomainKey = (opts as any)?.x?.label || (opts as any)?.x?.domainLabel;
      const yDomainKey = (opts as any)?.y?.label || (opts as any)?.y?.domainLabel;
      const xDomain = (sharedNumericDomains && xDomainKey && sharedNumericDomains[xDomainKey]) || (sharedMeasureDomains && xDomainKey && sharedMeasureDomains[xDomainKey]);
      const yDomain = (sharedNumericDomains && yDomainKey && sharedNumericDomains[yDomainKey]) || (sharedMeasureDomains && yDomainKey && sharedMeasureDomains[yDomainKey]);
      const next: Plot.PlotOptions = { ...opts };
      if (xDomain) next.x = { ...(opts.x as any), domain: xDomain } as any;
      if (yDomain) next.y = { ...(opts.y as any), domain: yDomain } as any;
      // Apply shared categorical domain so band categories align across facets
      if (sharedCategoryDomain && (next as any)?.x?.type === 'band') {
        next.x = { ...(next.x as any), domain: sharedCategoryDomain as any } as any;
      }
      if (sharedCategoryDomain && (next as any)?.y?.type === 'band') {
        next.y = { ...(next.y as any), domain: sharedCategoryDomain as any } as any;
      }
      // Adjust intrinsic size based on shared categorical domain to keep bar thickness stable
      if (sharedCategoryDomain && Array.isArray(sharedCategoryDomain) && sharedCategoryDomain.length > 0) {
        const count = sharedCategoryDomain.length;
        if (categoryAxis === 'y' && (next as any)?.y?.type === 'band') {
          const minH = Math.max(BAR_STEP_PX * 2, count * BAR_STEP_PX);
          (next as any).height = minH;
        }
        if (categoryAxis === 'x' && (next as any)?.x?.type === 'band') {
          const minW = Math.max(BAR_STEP_PX * 2, count * BAR_STEP_PX);
          (next as any).width = minW;
        }
      }
      // Force zero baseline for bar charts: when categoryAxis is on one side,
      // ensure the opposite numeric axis domain includes 0.
      const coerceZeroBaseline = (domain: any, values: number[]) => {
        if (!Array.isArray(values) || values.length === 0) return domain;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const lower = Math.min(0, min);
        const upper = max <= 0 ? 0 : max;
        return [lower, upper] as [number, number];
      };
      if (categoryAxis === 'x') {
        const key = yDomainKey as string | undefined;
        if (key) {
          const vals = subsetRows
            .map((row) => row?.[key as string])
            .filter((v) => typeof v === 'number' && !Number.isNaN(v));
          const coerced = coerceZeroBaseline((next as any)?.y?.domain, vals as number[]);
          next.y = { ...(next.y as any), domain: coerced } as any;
        }
      } else if (categoryAxis === 'y') {
        const key = xDomainKey as string | undefined;
        if (key) {
          const vals = subsetRows
            .map((row) => row?.[key as string])
            .filter((v) => typeof v === 'number' && !Number.isNaN(v));
          const coerced = coerceZeroBaseline((next as any)?.x?.domain, vals as number[]);
          next.x = { ...(next.x as any), domain: coerced } as any;
        }
      }
      return next;
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
    // Prefer explicit layout sizes from the child result when present
    let baseColumnSizes = baseResult.layout?.columnSizes as Array<number | 'fr'> | undefined;
    let baseRowSizes = baseResult.layout?.rowSizes as Array<number | 'fr'> | undefined;
    // Derive sizes from plot options if not provided
    if (!baseColumnSizes) {
      baseColumnSizes = Array.from({ length: cols }, (_, c) => {
        const sample = plots.find((p) => p.position.col === c);
        const w = (sample?.options as any)?.width;
        return typeof w === 'number' ? w : 'fr';
      });
    }
    if (!baseRowSizes) {
      baseRowSizes = Array.from({ length: rows }, (_, r) => {
        const sample = plots.find((p) => p.position.row === r);
        const h = (sample?.options as any)?.height;
        return typeof h === 'number' ? h : 'fr';
      });
    }
    return { plots, columns: cols, rows, columnSizes: baseColumnSizes, rowSizes: baseRowSizes };
  }

  // Single options → single plot
  if (baseResult.options) {
    return {
      plots: [{ id: 'p-0', title: '', options: baseResult.options, position: { row: 0, col: 0 } }],
      columns: 1,
      rows: 1,
      columnSizes: (baseResult.options as any)?.width ? [((baseResult.options as any).width as number)] : ['fr'],
      rowSizes: (baseResult.options as any)?.height ? [((baseResult.options as any).height as number)] : ['fr'],
    };
  }

  // Fallback empty
  return { plots: [], columns: 1, rows: 1 };
}

function baseGeneratePlot(context: ChartGenerationContext): PlotResult {
  const { xFields, yFields, queryResult } = context;
  const analysis = analyzeFields(xFields, yFields);
  // Do not short-circuit on empty data here; downstream chart creators
  // render empty frames so faceted cells remain consistent.

  // Mixed-axis measures → scatter
  if (analysis.hasMixedAxes) {
    const plotOptions = generateScatterPlot(analysis, context);
    return { library: 'observable-plot', options: plotOptions, layout: { type: 'single' } };
  }

  // If we have multiple candidates across axes (dimensions and/or measures),
  // build a cartesian grid so that combinations are preserved within faceting.
  const xCandidates: Field[] = [...(analysis as any).xMeasures, ...(analysis as any).xDimensions];
  const yCandidates: Field[] = [...(analysis as any).yMeasures, ...(analysis as any).yDimensions];
  const multiAcrossAxes =
    xCandidates.length > 0 && yCandidates.length > 0 && (xCandidates.length > 1 || yCandidates.length > 1);
  if (multiAcrossAxes) {
    // In faceting base-spec we don't need shared measure domains when only dimensions are used.
    const sharedMeasureDomains = computeSharedMeasureDomains(queryResult.rows, xCandidates as any[], yCandidates as any[]);
    return {
      library: 'observable-plot',
      plots: generateCartesianPlots(queryResult.rows, xCandidates, yCandidates, sharedMeasureDomains),
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

  // Multi-measure per axis → our existing bar grid
  if (analysis.isMultiMeasure && !analysis.hasMixedAxes) {
    try { return multiMeasureBarChart(context); } catch { /* fall through */ }
  }

  // Fallback to single-chart rules (this handles continuous dimensions on both axes)
  const single = genChartOptionsRule(analysis, context);
  return single;
}
/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
// moved to domains/measureDomains.ts

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