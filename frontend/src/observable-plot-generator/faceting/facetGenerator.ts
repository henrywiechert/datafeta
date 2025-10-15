import * as Plot from '@observablehq/plot';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING, MIN_BAND_TRACKS, MIN_SERIES_PANES } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext, PlotResult, CategoryAxisDescriptor } from '../types';
import { buildFacetCombos, filterRowsByFacets, uniqueValuesForField } from './facetUtils';
import { FacetPlan } from './facetPlanner';
import { getResultColumnName } from '../../utils/fieldUtils';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { computeSharedCategoricalDomains } from '../domains/numericDomains';
import { baseGeneratePlot } from '../observablePlotGenerator';
import { 
  computeSharedDomainsForFaceting, 
  applySharedDomains, 
  applyIntrinsicSizeFromCategoryDomain,
  SharedDomains
} from './facetDomains';
import { computeGridLayout, computeFacetLabels, deriveCellSizes } from './facetGrid';
import { getPlotColorConfig } from '../utils/colorSchemeUtils';
import { coordinateFacetedGrid, CellGenerator, CellResult, PositionedPlot } from './facetCoordinator';
import { buildBarOptions, resolveMeasureAlias } from '../chartTypes/barCore';

/**
 * Chart-specific configuration derived from context and facet plan.
 * This bridges the gap between the simplified FacetPlan and chart-type-specific rendering needs.
 */
interface ChartConfig {
  categoryAxis: 'x' | 'y' | null;
  categoryField: Field | null;
  barOrientation: 'barX' | 'barY' | null;
  sharedCategoryDomain: any[] | null;
  effectiveRowFacetFields: Field[];
  effectiveColFacetFields: Field[];
}

/**
 * Determine chart-specific configuration from context.
 * This function encapsulates the logic that was previously in facetPlanner.
 */
function deriveChartConfig(
  context: ChartGenerationContext,
  plan: FacetPlan
): ChartConfig {
  const { xFields, yFields, queryResult } = context;
  const { rowFacetFields, colFacetFields } = plan;

  // Check if this is a bar chart scenario (measure on one axis only)
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  let barOrientation: 'barX' | 'barY' | null = xMeasure && !yMeasure ? 'barX' : (!xMeasure && yMeasure ? 'barY' : null);
  let categoryAxis: 'x' | 'y' | null = barOrientation === 'barX' ? 'y' : (barOrientation === 'barY' ? 'x' : null);

  // If the opposite axis contains a continuous dimension, do NOT force bar orientation/category axis.
  const hasXContinuousDim = xFields.some((f) => f.type === 'dimension' && f.flavour === 'continuous');
  const hasYContinuousDim = yFields.some((f) => f.type === 'dimension' && f.flavour === 'continuous');
  
  if ((barOrientation === 'barY' && hasXContinuousDim) || (barOrientation === 'barX' && hasYContinuousDim)) {
    barOrientation = null;
    categoryAxis = null;
  }

  let categoryField: Field | null = null;
  let sharedCategoryDomain: any[] | null = null;

  // If we have a category axis, find the appropriate discrete field to use
  if (categoryAxis) {
    const axisFields = categoryAxis === 'x' ? xFields : yFields;
    const discreteFields = axisFields.filter((f) => f.flavour === 'discrete');
    
    // Use the last discrete field on the category axis
    if (discreteFields.length > 0) {
      categoryField = discreteFields[discreteFields.length - 1];
      sharedCategoryDomain = uniqueValuesForField(queryResult.rows, categoryField);
    } else {
      // Fallback single category when none present
      sharedCategoryDomain = [' '];
    }
  }

  // Effective facet fields exclude the one used for category axis
  const categoryFieldId = categoryField?.id;
  const effectiveRowFacetFields = rowFacetFields.filter((f) => f.id !== categoryFieldId);
  const effectiveColFacetFields = colFacetFields.filter((f) => f.id !== categoryFieldId);

  return {
    categoryAxis,
    categoryField,
    barOrientation,
    sharedCategoryDomain,
    effectiveRowFacetFields,
    effectiveColFacetFields,
  };
}

/**
 * Create a cell generator for multi-measure bar charts.
 * This handles the special case of bar charts with multiple measures on one axis.
 */
function createBarCellGenerator(
  xFields: Field[],
  yFields: Field[],
  barOrientation: 'barX' | 'barY',
  categoryAxis: 'x' | 'y',
  categoryField: Field | null,
  sharedCategoryDomain: any[],
  colorField?: Field,
  colorScheme?: string
): CellGenerator {
  return (cellData, cellContext, sharedDomains, facetPosition): CellResult => {
    const orientedFields = barOrientation === 'barX' ? xFields : yFields;
    const seriesFields = orientedFields.filter((f) => 
      f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
    );
    
    const categories = sharedCategoryDomain && sharedCategoryDomain.length > 0 
      ? sharedCategoryDomain 
      : [' '];
    
    const baseRowHeight = categoryAxis === 'y' 
      ? Math.max(BAR_STEP_PX * MIN_BAND_TRACKS, categories.length * BAR_STEP_PX) 
      : 'fr';
    const baseColWidth = categoryAxis === 'x' 
      ? Math.max(BAR_STEP_PX * MIN_BAND_TRACKS, categories.length * BAR_STEP_PX) 
      : 'fr';
    
    const baseColsPerFacet = barOrientation === 'barX' ? Math.max(MIN_SERIES_PANES, seriesFields.length) : 1;
    const baseRowsPerFacet = barOrientation === 'barY' ? Math.max(MIN_SERIES_PANES, seriesFields.length) : 1;
    
    const plots: PositionedPlot[] = [];
    const categoryColumnName = categoryField ? getFieldColumnName(categoryField) : undefined;
    const colorColumnName = colorField ? getFieldColumnName(colorField) : undefined;
    
    // Create a subplot per series using barCore.buildBarOptions()
    for (let s = 0; s < Math.max(1, seriesFields.length); s++) {
      const f = seriesFields[s] || orientedFields.find((ff) => ff.type === 'measure')!;
      const isMeasure = f.type === 'measure';
      let options: Plot.PlotOptions;
      let title: string;
      
      if (isMeasure) {
        const measureName = resolveMeasureAlias(f);
        const valueDomain = (sharedDomains.measure as any)[measureName] || [0, 1];
        
        // Use barCore.buildBarOptions() instead of inline Plot.barX/barY
        options = buildBarOptions({
          data: cellData,
          measureName,
          orientation: barOrientation === 'barX' ? 'horizontal' : 'vertical',
          categoryColumn: categoryColumnName,
          categoriesDomain: categories,
          colorColumn: colorColumnName,
          colorDomain: sharedDomains.color && sharedDomains.color.length > 0 ? sharedDomains.color : undefined,
          colorSchemeId: colorScheme,
          bandPadding: BAND_PADDING,
          zeroBaseline: true,
          valueDomainOverride: valueDomain as [number, number],
          tooltipColumns: [colorField?.columnName].filter(Boolean) as string[],
        });
        
        title = measureName;
      } else {
        // For dimension series (tick strips), keep inline since barCore doesn't handle this
        const dimCol = (f as any).columnName;
        options = barOrientation === 'barX'
          ? { 
              x: { label: dimCol, grid: true }, 
              y: { label: categoryColumnName || ' ', type: 'band' as any, domain: categories as any, padding: BAND_PADDING as any }, 
              marks: [Plot.tickX(cellData, { x: dimCol, y: categoryColumnName || (() => categories[0]), stroke: DEFAULT_CHART_COLOR, tip: { pointer: 'x', preferredAnchor: 'top-right' } })] 
            } as Plot.PlotOptions
          : { 
              y: { label: dimCol, grid: true }, 
              x: { label: categoryColumnName || ' ', type: 'band' as any, domain: categories as any, padding: BAND_PADDING as any }, 
              marks: [Plot.tickY(cellData, { y: dimCol, x: categoryColumnName || (() => categories[0]), stroke: DEFAULT_CHART_COLOR, tip: { pointer: 'y', preferredAnchor: 'top-right' } })] 
            } as Plot.PlotOptions;
        title = dimCol;
      }
      
      plots.push({
        id: `series-${s}`,
        title,
        options,
        position: {
          row: barOrientation === 'barY' ? s : 0,
          col: barOrientation === 'barX' ? s : 0,
        },
      });
    }
    
    return {
      plots,
      columns: baseColsPerFacet,
      rows: baseRowsPerFacet,
      columnSizes: Array.from({ length: baseColsPerFacet }, () => baseColWidth as any),
      rowSizes: Array.from({ length: baseRowsPerFacet }, () => baseRowHeight as any),
    };
  };
}

/**
 * Facet planner: If there are discrete fields present, facet the base chart by up to 2 fields
 * (first → rows, second → columns). For each facet combination, we regenerate the base chart
 * on the filtered subset. Discrete fields do not directly influence base chart type, except
 * for bar charts where a category axis can be injected if needed (see below).
 */
export function generateFacetedGrid(context: ChartGenerationContext, plan: FacetPlan): PlotResult {
    const { xFields, yFields, queryResult, colorField, colorScheme } = context;
    
    // Derive chart-specific configuration from the simplified plan
    const chartConfig = deriveChartConfig(context, plan);
    const {
      categoryAxis,
      categoryField,
      barOrientation,
      sharedCategoryDomain,
      effectiveRowFacetFields,
      effectiveColFacetFields,
    } = chartConfig;
    
    // Compute a shared color domain across all facets when a color field is present
    const sharedColorDomain = colorField ? uniqueValuesForField(queryResult.rows, colorField) : undefined;
    
  // BAR path: Use coordinator with bar cell generator
  if (barOrientation && categoryAxis) {
    // Create a specialized cell generator for multi-measure bar charts
    const barCellGen = createBarCellGenerator(
      xFields,
      yFields,
      barOrientation,
      categoryAxis,
      categoryField,
      sharedCategoryDomain || [],
      colorField,
      colorScheme
    );
    
    // Use the coordinator for chart-type-agnostic faceting
    return coordinateFacetedGrid({
      context,
      plan: { rowFacetFields: effectiveRowFacetFields, colFacetFields: effectiveColFacetFields },
      cellGenerator: barCellGen,
      categoryField,
      sharedCategoryDomain: sharedCategoryDomain || undefined,
    });
  }
  
  // GENERIC PATH: Use coordinator with default cell generator
  // This is the new, cleaner architecture using the strategy pattern
  
  // Create a cell generator that uses buildBaseSpecForDataSubset
  const defaultCellGenerator: CellGenerator = (cellData, cellContext, sharedDomains, facetPosition) => {
    // Create a modified context with filtered data
    const localContext: ChartGenerationContext = {
      ...cellContext,
      queryResult: { ...cellContext.queryResult, rows: cellData },
    };
    
    const baseSpec = buildBaseSpecForDataSubset(
      localContext,
      categoryAxis,
      categoryField?.id || null,
      cellData,
      sharedDomains,
      effectiveRowFacetFields,
      effectiveColFacetFields,
      sharedCategoryDomain || undefined,
      cellContext.colorScheme
    );
    
    return baseSpec;
  };
  
  // Use the coordinator for chart-type-agnostic faceting
  return coordinateFacetedGrid({
    context,
    plan: { rowFacetFields: effectiveRowFacetFields, colFacetFields: effectiveColFacetFields },
    cellGenerator: defaultCellGenerator,
    categoryField,
    sharedCategoryDomain: sharedCategoryDomain || undefined,
  });
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
    subsetRows: Array<Record<string, any>>,
    sharedDomains: SharedDomains,
    rowFacetFields?: Field[] | Field | null,
    colFacetFields?: Field[] | Field | null,
    sharedCategoryDomain?: any[],
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
  
    // Apply shared domains using centralized utility
    const applyDomainsFn = (opts: Plot.PlotOptions) => {
      // First apply standard shared domains (measure, numeric, color, categorical)
      let next = applySharedDomains(opts, sharedDomains, colorScheme);
      
      // Apply categorical domain override if provided explicitly
      if (sharedCategoryDomain && Array.isArray(sharedCategoryDomain)) {
        if ((next as any)?.x?.type === 'band') {
          next.x = { ...(next.x as any), domain: sharedCategoryDomain as any } as any;
        }
        if ((next as any)?.y?.type === 'band') {
          next.y = { ...(next.y as any), domain: sharedCategoryDomain as any } as any;
        }
      }
      
      // Apply intrinsic size adjustments for category domains
      next = applyIntrinsicSizeFromCategoryDomain(
        next, 
        categoryAxis, 
        sharedCategoryDomain, 
        BAR_STEP_PX
      );
      
      // Force zero baseline for bar charts: when categoryAxis is on one side,
      // ensure the opposite numeric axis domain includes 0.
      // TODO: This is bar-specific logic that should move to barCore.ts
      const coerceZeroBaseline = (domain: any, values: number[]) => {
        if (!Array.isArray(values) || values.length === 0) return domain;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const lower = Math.min(0, min);
        const upper = max <= 0 ? 0 : max;
        return [lower, upper] as [number, number];
      };
      const xDomainKey = (next as any)?.x?.domainKey || (next as any)?.x?.domainLabel || (next as any)?.x?.label;
      const yDomainKey = (next as any)?.y?.domainKey || (next as any)?.y?.domainLabel || (next as any)?.y?.label;
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
      baseResult.options = applyDomainsFn(baseResult.options);
    }
    if (baseResult.plots) {
      baseResult.plots = baseResult.plots.map((p) => ({ ...p, options: applyDomainsFn(p.options) }));
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

