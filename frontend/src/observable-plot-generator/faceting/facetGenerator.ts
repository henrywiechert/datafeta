import * as Plot from '@observablehq/plot';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING, MIN_BAND_TRACKS, MIN_SERIES_PANES } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext, PlotResult, CategoryAxisDescriptor } from '../types';
import { buildFacetCombos, filterRowsByFacets } from './facetUtils';
import { FacetPlan, uniqueValuesForField } from './facetPlanner';
import { getResultColumnName } from '../../utils/fieldUtils';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { computeSharedNumericDomains, computeSharedCategoricalDomains } from '../domains/numericDomains';
import { baseGeneratePlot } from '../observablePlotGenerator';
import { getPlotColorConfig } from '../utils/colorSchemeUtils';


/**
 * Facet planner: If there are discrete fields present, facet the base chart by up to 2 fields
 * (first → rows, second → columns). For each facet combination, we regenerate the base chart
 * on the filtered subset. Discrete fields do not directly influence base chart type, except
 * for bar charts where a category axis can be injected if needed (see below).
 */
export function generateFacetedGrid(context: ChartGenerationContext, plan: FacetPlan): PlotResult {
    const { xFields, yFields, queryResult, colorField, colorScheme } = context;
    const {
      rowFacetFields,
      colFacetFields,
      categoryAxis,
      categoryField,
      barOrientation,
      sharedCategoryDomain,
    } = plan;
    
    // Compute a shared color domain across all facets when a color field is present
    const sharedColorDomain = colorField ? uniqueValuesForField(queryResult.rows, colorField) : undefined;
    
  // BAR path: switch back to OP marks per cell (for exact alignment with axes)
  if (barOrientation && categoryAxis) {
      // Collect all measures and continuous dims on the oriented axis, preserving original order
      const orientedFields = barOrientation === 'barX' ? xFields : yFields;
      const measureFields = orientedFields.filter((f) => f.type === 'measure');
      const seriesFields = orientedFields.filter((f) => f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous'));
      // Choose facet fields excluding category
      const effectiveRowFacetFields = yFields.filter((f) => f.flavour === 'discrete' && (categoryAxis !== 'y' || f.id !== categoryField?.id));
      const effectiveColFacetFields = xFields.filter((f) => f.flavour === 'discrete' && (categoryAxis !== 'x' || f.id !== categoryField?.id));

      const sharedMeasureDomains = computeSharedMeasureDomains(
        queryResult.rows, 
        measureFields as any[], 
        measureFields as any[],
        colorField,  // Pass color field for stacking calculation
        categoryField,  // Pass category field for grouping
        [...effectiveRowFacetFields, ...effectiveColFacetFields]  // Pass facet fields for per-facet calculation
      );

      const { rowValuesLevels, colValuesLevels, safeRowCombos, safeColCombos } = computeFacetLevelsAndCombos(
        queryResult.rows,
        effectiveRowFacetFields,
        effectiveColFacetFields
      );

  const combinedPlots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }> = [];
      // Ensure categorical domain includes all intended categories, even if missing in subset
      // Build consistent categorical domain from global data if none provided
      const categories = (sharedCategoryDomain && sharedCategoryDomain.length > 0)
        ? sharedCategoryDomain
        : (categoryField ? computeSharedCategoricalDomains(queryResult.rows, [categoryField])[categoryField.columnName] : [' ']);
      const baseRowHeight = categoryAxis === 'y' ? Math.max(BAR_STEP_PX * MIN_BAND_TRACKS, categories.length * BAR_STEP_PX) : 'fr';
      const baseColWidth = categoryAxis === 'x' ? Math.max(BAR_STEP_PX * MIN_BAND_TRACKS, categories.length * BAR_STEP_PX) : 'fr';

      const baseColsPerFacet = barOrientation === 'barX' ? Math.max(MIN_SERIES_PANES, seriesFields.length) : 1;
      const baseRowsPerFacet = barOrientation === 'barY' ? Math.max(MIN_SERIES_PANES, seriesFields.length) : 1;

      for (let r = 0; r < safeRowCombos.length; r++) {
        for (let c = 0; c < safeColCombos.length; c++) {
          const subset = filterRowsByFacets(queryResult.rows, effectiveRowFacetFields, safeRowCombos[r], effectiveColFacetFields, safeColCombos[c]);

          // Create a subplot per series (in oriented axis order): measures as bars, continuous dims as tick-strips
          for (let s = 0; s < Math.max(1, seriesFields.length); s++) {
            const f = seriesFields[s] || (barOrientation === 'barX' ? xFields.find((ff) => ff.type === 'measure')! : yFields.find((ff) => ff.type === 'measure')!);
            const isMeasure = f.type === 'measure';
            let options: Plot.PlotOptions;
            let title: string;
            if (isMeasure) {
              const measureName = getResultColumnName({ ...f, aggregation: (f as any).aggregation || 'sum' } as any);
              const valueDomain = (sharedMeasureDomains as any)[measureName] || [0, 1];
              const categoryColumnName = categoryField ? getFieldColumnName(categoryField) : null;
              const colorColumnName = colorField ? getFieldColumnName(colorField) : null;
              const colorConfig = getPlotColorConfig(colorScheme);
              options = barOrientation === 'barX'
                ? {
                    x: { label: measureName, grid: true, domain: valueDomain as any, nice: false, domainKey: measureName } as any,
                    y: { label: categoryColumnName || ' ', type: 'band' as any, domain: categories as any, padding: BAND_PADDING as any, domainKey: categoryColumnName } as any,
                    marks: [
                      Plot.barX(subset, { x: measureName, y: categoryColumnName || (() => categories[0]), fill: colorColumnName || DEFAULT_CHART_COLOR, tip: { pointer: 'x', preferredAnchor: 'top-right' } }),
                      Plot.ruleX([0])
                    ],
                    ...(colorField && sharedColorDomain && sharedColorDomain.length > 0 ? {
                      color: {
                        domain: sharedColorDomain as any,
                        ...colorConfig as any,
                        type: 'ordinal' as any,
                      } as any
                    } : {})
                  }
                : {
                    y: { label: measureName, grid: true, domain: valueDomain as any, nice: false, domainKey: measureName } as any,
                    x: { label: categoryColumnName || ' ', type: 'band' as any, domain: categories as any, padding: BAND_PADDING as any, domainKey: categoryColumnName } as any,
                    marks: [
                      Plot.barY(subset, { 
                        y: measureName, 
                        x: categoryColumnName || (() => categories[0]), 
                        fill: colorColumnName || DEFAULT_CHART_COLOR,
                        order: colorColumnName // Ensure consistent stacking order
                      , tip: { pointer: 'y', preferredAnchor: 'top-right' } }),
                      Plot.ruleY([0])
                    ],
                    ...(colorField && sharedColorDomain && sharedColorDomain.length > 0 ? {
                      color: {
                        domain: sharedColorDomain as any,
                        ...colorConfig as any,
                        type: 'ordinal' as any,
                      } as any
                    } : {})
                  } as any;
              title = measureName;
            } else {
              const dimCol = (f as any).columnName;
              options = barOrientation === 'barX'
                ? { x: { label: dimCol, grid: true }, y: { label: categoryField?.columnName || ' ', type: 'band' as any, domain: categories as any, padding: BAND_PADDING as any }, marks: [Plot.tickX(subset, { x: dimCol, y: categoryField?.columnName || (() => categories[0]), stroke: DEFAULT_CHART_COLOR, tip: { pointer: 'x', preferredAnchor: 'top-right' } })] } as Plot.PlotOptions
                : { y: { label: dimCol, grid: true }, x: { label: categoryField?.columnName || ' ', type: 'band' as any, domain: categories as any, padding: BAND_PADDING as any }, marks: [Plot.tickY(subset, { y: dimCol, x: categoryField?.columnName || (() => categories[0]), stroke: DEFAULT_CHART_COLOR, tip: { pointer: 'y', preferredAnchor: 'top-right' } })] } as Plot.PlotOptions;
              title = dimCol;
            }
            const pos = {
              row: r * baseRowsPerFacet + (barOrientation === 'barY' ? s : 0),
              col: c * baseColsPerFacet + (barOrientation === 'barX' ? s : 0),
            };
            combinedPlots.push({ id: `facet-${r}-${c}-s${s}`, title, options, position: pos });
          }
        }
      }

      const columns = safeColCombos.length * baseColsPerFacet;
      const rows = safeRowCombos.length * baseRowsPerFacet;
      const columnSizes = Array.from({ length: columns }, () => baseColWidth as any);
      const rowSizes = Array.from({ length: rows }, () => baseRowHeight as any);

      return {
        library: 'observable-plot',
        plots: combinedPlots,
        sharedDomains: { byMeasure: sharedMeasureDomains as any },
        layout: {
          type: 'grid',
          columns,
          rows,
          columnSizes,
          rowSizes,
        },
        facetLabels: {
          rowsLevels: effectiveRowFacetFields.length > 0 ? effectiveRowFacetFields.map((f, i) => ({ fieldLabel: getFieldColumnName(f), values: rowValuesLevels[i] })) : undefined,
          colsLevels: effectiveColFacetFields.length > 0 ? effectiveColFacetFields.map((f, i) => ({ fieldLabel: getFieldColumnName(f), values: colValuesLevels[i] })) : undefined,
          groupSpan: { columnsPerFacet: baseColsPerFacet, rowsPerFacet: baseRowsPerFacet },
          spans: {
            baseCols: baseColsPerFacet,
            baseRows: baseRowsPerFacet,
            columns: computeLevelSpans(effectiveColFacetFields, baseColsPerFacet, colValuesLevels),
            rows: computeLevelSpans(effectiveRowFacetFields, baseRowsPerFacet, rowValuesLevels),
          },
        },
      };
    }
  
  // Compute facet levels and safe combos
  const { rowValuesLevels, colValuesLevels, safeRowCombos, safeColCombos } = computeFacetLevelsAndCombos(
    queryResult.rows,
    rowFacetFields,
    colFacetFields
  );
  
    // Compute shared measure domains across whole data for comparability
    const allMeasures = [...xFields, ...yFields].filter((f: any) => f.type === 'measure' && f.flavour === 'continuous');
    const xCandidates = allMeasures; // reusing computeSharedMeasureDomains signature convenience
    const yCandidates = allMeasures;
    const sharedMeasureDomains = computeSharedMeasureDomains(
      queryResult.rows, 
      xCandidates as any[], 
      yCandidates as any[],
      colorField,  // Pass color field for stacking calculation
      undefined  // No category field in cartesian grid mode
    );
    // Compute shared numeric domains for continuous dimensions and measures (by column/alias)
    const sharedNumericDomains = computeSharedNumericDomains(queryResult.rows, xFields as any[], yFields as any[]);
  
    const combinedPlots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }> = [];
  
    // Determine base layout by generating one sample facet (first values)
    const sampleRows = filterRowsByFacets(queryResult.rows, rowFacetFields, safeRowCombos[0], colFacetFields, safeColCombos[0]);
    const baseSpec = buildBaseSpecForDataSubset(
      context,
      categoryAxis,
      categoryField?.id || null,
      sampleRows,
      sharedMeasureDomains,
      sharedNumericDomains,
      // pass all facet fields to be excluded in local context
      rowFacetFields,
      colFacetFields,
      sharedCategoryDomain || undefined,
      sharedColorDomain,
      colorScheme
    );
    const baseCols = baseSpec.columns;
    const baseRows = baseSpec.rows;
  
    for (let r = 0; r < safeRowCombos.length; r++) {
      for (let c = 0; c < safeColCombos.length; c++) {
        const subset = filterRowsByFacets(queryResult.rows, rowFacetFields, safeRowCombos[r], colFacetFields, safeColCombos[c]);
        const facetSpec = buildBaseSpecForDataSubset(
          context,
          categoryAxis,
          categoryField?.id || null,
          subset,
          sharedMeasureDomains,
          sharedNumericDomains,
          rowFacetFields,
          colFacetFields,
          sharedCategoryDomain || undefined,
          sharedColorDomain,
          colorScheme
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
          columns: computeLevelSpans(colFacetFields, baseCols, colValuesLevels),
          rows: computeLevelSpans(rowFacetFields, baseRows, rowValuesLevels),
        },
      }
    };
  }

  type BaseSpec = {
    plots: Array<{ id: string; title: string; options: Plot.PlotOptions; position: { row: number; col: number } }>;
    columns: number;
    rows: number;
    columnSizes?: Array<number | 'fr'>;
    rowSizes?: Array<number | 'fr'>;
  };
  
  function computeFacetLevelsAndCombos(
    rows: Array<Record<string, any>>,
    rowFacetFields: Field[],
    colFacetFields: Field[]
  ) {
    const rowValuesLevels = rowFacetFields.map((f) => uniqueValuesForField(rows, f));
    const colValuesLevels = colFacetFields.map((f) => uniqueValuesForField(rows, f));
    const rowCombos = buildFacetCombos(rowFacetFields, rowValuesLevels);
    const colCombos = buildFacetCombos(colFacetFields, colValuesLevels);
    const safeRowCombos = rowCombos.length > 0 ? rowCombos : [[]];
    const safeColCombos = colCombos.length > 0 ? colCombos : [[]];
    return { rowValuesLevels, colValuesLevels, safeRowCombos, safeColCombos };
  }
  
  function buildBaseSpecForDataSubset(
    context: ChartGenerationContext,
    categoryAxis: 'x' | 'y' | null,
    excludedCategoryFieldId: string | null,
    subsetRows: Array<Record<string, any>>,
    sharedMeasureDomains?: Record<string, [number, number]>,
    sharedNumericDomains?: Record<string, [number, number]>,
    rowFacetFields?: Field[] | Field | null,
    colFacetFields?: Field[] | Field | null,
    sharedCategoryDomain?: any[],
    sharedColorDomain?: any[],
    colorScheme?: string
  ): BaseSpec {
    const { queryResult, xFields, yFields } = context;
  
    // Filter out discrete fields that are used for faceting (not category axis)
    const colFacetIds = Array.isArray(colFacetFields) ? colFacetFields.map((f) => f.id) : (colFacetFields ? [colFacetFields.id] : []);
    const rowFacetIds = Array.isArray(rowFacetFields) ? rowFacetFields.map((f) => f.id) : (rowFacetFields ? [rowFacetFields.id] : []);
    let localXFields = xFields.filter(f => f.id !== excludedCategoryFieldId && !colFacetIds.includes(f.id));
    let localYFields = yFields.filter(f => f.id !== excludedCategoryFieldId && !rowFacetIds.includes(f.id));
    
    // Do not inject a pseudo dimension; instead provide a category axis descriptor to the base generator
    let categoryAxisDescriptor: CategoryAxisDescriptor | undefined;
    if (categoryAxis && excludedCategoryFieldId) {
      const axisOriginal = categoryAxis === 'x' ? xFields : yFields;
      const catField = axisOriginal.find((f) => f.id === excludedCategoryFieldId);
      if (catField) {
        const colName = getFieldColumnName(catField);
        categoryAxisDescriptor = {
          axis: categoryAxis,
          columnName: colName,
          domain: sharedCategoryDomain,
        };
      }
    }
  
    const localContext: ChartGenerationContext = {
      ...context,
      xFields: localXFields,
      yFields: localYFields,
      queryResult: { ...queryResult, rows: subsetRows },
      categoryAxisDescriptor,
    };
  
    const baseResult = baseGeneratePlot(localContext);
  
    // Apply shared domains by measure if provided
    if (sharedMeasureDomains || sharedNumericDomains || (sharedColorDomain && sharedColorDomain.length > 0)) {
      const applyDomains = (opts: Plot.PlotOptions) => {
        const xDomainKey = (opts as any)?.x?.domainKey || (opts as any)?.x?.domainLabel || (opts as any)?.x?.label;
        const yDomainKey = (opts as any)?.y?.domainKey || (opts as any)?.y?.domainLabel || (opts as any)?.y?.label;
        const xDomain = (sharedNumericDomains && xDomainKey && sharedNumericDomains[xDomainKey]) || (sharedMeasureDomains && xDomainKey && sharedMeasureDomains[xDomainKey]);
        const yDomain = (sharedNumericDomains && yDomainKey && sharedNumericDomains[yDomainKey]) || (sharedMeasureDomains && yDomainKey && sharedMeasureDomains[yDomainKey]);
        const next: Plot.PlotOptions = { ...opts };
        if (xDomain) next.x = { ...(opts.x as any), domain: xDomain } as any;
        if (yDomain) next.y = { ...(opts.y as any), domain: yDomain } as any;
        // Apply shared color domain so color mapping remains consistent across facets
        if (sharedColorDomain && sharedColorDomain.length > 0) {
          const colorConfig = getPlotColorConfig(colorScheme);
          next.color = {
            ...(next as any).color,
            domain: sharedColorDomain as any,
            ...colorConfig as any,
            type: 'ordinal' as any,
          } as any;
        }
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
  
  function computeLevelSpans(fields: Field[], base: number, levelValues: any[][]): number[] {
    // Each level label should span all inner levels and base plots
    if (!fields || fields.length === 0) return [];
    const spans: number[] = [];
    for (let i = 0; i < fields.length; i++) {
      const innerLevels = (levelValues || []).slice(i + 1);
      const innerProduct = innerLevels.reduce((acc: number, vals: any[]) => acc * (Array.isArray(vals) ? Math.max(1, vals.length) : 1), 1);
      spans.push(base * innerProduct);
    }
    return spans;
  }
