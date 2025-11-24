import * as Plot from '@observablehq/plot';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING, MIN_BAND_TRACKS, MIN_SERIES_PANES } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext, PlotResult, CategoryAxisDescriptor } from '../types';
import { uniqueValuesForField } from './facetUtils';
import { FacetPlan } from './facetPlanner';
import { baseGeneratePlot } from '../observablePlotGenerator';
import { 
  applySharedDomains, 
  applyIntrinsicSizeFromCategoryDomain,
  SharedDomains
} from './facetDomains';
import { coordinateFacetedGrid, CellGenerator, CellResult, PositionedPlot } from './facetCoordinator';
import { buildBarOptions, resolveMeasureAlias, computeBandPaddingFromSizeField, sortCategoriesByValue } from '../chartTypes/barCore';
import { getResultColumnName } from '../../utils/fieldUtils';
import { createLabelMark, prepareLabelData, LabelRenderConfig } from '../utils/labelUtils';
import { buildLabelCfg } from '../observablePlotGenerator';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';

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

  // Check if this is a bar/tick strip scenario (measure or continuous dimension on one axis only)
  const xMeasure = xFields.find((f) => f.type === 'measure');
  const yMeasure = yFields.find((f) => f.type === 'measure');
  const xContinuousDim = xFields.find((f) => f.type === 'dimension' && f.flavour === 'continuous');
  const yContinuousDim = yFields.find((f) => f.type === 'dimension' && f.flavour === 'continuous');

  // Detect bar/tick strip orientation: continuous field on one axis, discrete on other
  // This handles both measures (bars) and continuous dimensions (tick strips)
  let barOrientation: 'barX' | 'barY' | null = null;
  if ((xMeasure || xContinuousDim) && !yMeasure && !yContinuousDim) {
    barOrientation = 'barX';
  } else if ((yMeasure || yContinuousDim) && !xMeasure && !xContinuousDim) {
    barOrientation = 'barY';
  }
  
  let categoryAxis: 'x' | 'y' | null = barOrientation === 'barX' ? 'y' : (barOrientation === 'barY' ? 'x' : null);

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
  colorField?: Field | null,
  bandPadding?: number,
  labelCfg?: { labelFields: any[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number },
  manualColor?: string,
  tooltipFields?: Field[]
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
    const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
    
    // Create a subplot per series using barCore.buildBarOptions()
    for (let s = 0; s < Math.max(1, seriesFields.length); s++) {
      const f = seriesFields[s] || orientedFields.find((ff) => ff.type === 'measure')!;
      const isMeasure = f.type === 'measure';
      let options: Plot.PlotOptions;
      let title: string;
      
      if (isMeasure) {
        const measureName = resolveMeasureAlias(f);
        const valueDomain = (sharedDomains.measure as any)[measureName] || [0, 1];
        
        // Use the global band padding computed from size field
        const dynamicPadding = bandPadding ?? BAND_PADDING;

        // Don't use valueDomainOverride for stacked bars (no category but has color)
        // Let buildBarOptions calculate the correct stacked domain
        const useStackedDomain = !categoryColumnName && colorColumnName;

        // Note: Sorting is now handled globally in generateFacetedGrid (before cell generation)
        // so all facets share the same category order. This prevents misalignment when facets
        // share a common axis but have different measure values.
        // The 'categories' array passed in already reflects the global sort order.
        let sortedCategories = categories;

        // Use barCore.buildBarOptions() instead of inline Plot.barX/barY
        options = buildBarOptions({
          data: cellData,
          measureName,
          orientation: barOrientation === 'barX' ? 'horizontal' : 'vertical',
          categoryColumn: categoryColumnName,
          categoriesDomain: sortedCategories,
          colorColumn: colorColumnName,
          colorScale: sharedDomains.colorScale,
          bandPadding: dynamicPadding,
          zeroBaseline: true,
          valueDomainOverride: useStackedDomain ? undefined : (valueDomain as [number, number]),
          tooltipFields: tooltipFields,
          // When there's no color field, use the global/manual bar color for fill
          manualColor: colorField ? undefined : manualColor,
        });
        
        // --- Label integration for faceted bars ---
        if (labelCfg) {
          let labelData = cellData;
          const orientation = barOrientation === 'barX' ? 'horizontal' : 'vertical';
          
          // When categories are present AND we have color (stacked bars), use RAW data for Plot.stackY()
          // When categories are present WITHOUT color, aggregate by category only
          if (categoryColumnName && colorColumnName) {
            // For stacked bars with categories: use raw data, Plot.stackY will handle the stacking
            labelData = cellData; // Already has category, measure, and color columns
          } else if (categoryColumnName) {
            // For non-stacked categorical bars: aggregate by category only
            const aggregatedMap = new Map<string, any>();
            for (const row of cellData) {
              const key = String(row[categoryColumnName]);
              if (!aggregatedMap.has(key)) {
                aggregatedMap.set(key, {
                  [measureName]: 0,
                  [categoryColumnName]: row[categoryColumnName]
                });
              }
              const existing = aggregatedMap.get(key);
              const val = row[measureName];
              if (typeof val === 'number' && isFinite(val)) {
                existing[measureName] += val;
              }
            }
            labelData = Array.from(aggregatedMap.values());
          }
          
          // Bars are stacked whenever we have a color field (regardless of whether we have categories)
          const isStacked = !!colorColumnName;
          
          const labelConfig: LabelRenderConfig = {
            data: labelData,
            xColumn: orientation === 'vertical' ? (categoryColumnName || '__single_category') : measureName,
            yColumn: orientation === 'vertical' ? measureName : (categoryColumnName || '__single_category'),
            labelFields: labelCfg.labelFields as any[],
            labelsEnabled: labelCfg.labelsEnabled,
            samplingStrategy: labelCfg.samplingStrategy,
            samplingThreshold: labelCfg.samplingThreshold,
            sampleEvery: labelCfg.sampleEvery,
            chartType: 'bar',
            orientation,
            colorColumn: colorColumnName,
            isStacked: isStacked
          };
          
          const prepared = prepareLabelData(labelConfig);
          const mark = createLabelMark(prepared, labelConfig, labelConfig.xColumn, labelConfig.yColumn);
          if (mark) {
            (options.marks = options.marks || []).push(mark as any);
          }
        }
        
        title = measureName;
      } else {
        // For dimension series (tick strips), compute explicit domain from data
        const dimCol = (f as any).columnName;
        
        // Compute domain from the cell's filtered data
        const isNumericOrDate = (v: any) =>
          (typeof v === 'number' && Number.isFinite(v)) ||
          v instanceof Date ||
          (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
        
        const values = cellData
          .map((row: any) => row[dimCol])
          .filter((v: any) => isNumericOrDate(v));
        
        let axisDomain: [number, number] | [Date, Date] | undefined;
        if (values.length > 0) {
          const sample = values[0];
          if (typeof sample === 'number') {
            const nums = values as number[];
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            axisDomain = [min, max];
          } else {
            const toDate = (v: any) => (v instanceof Date ? v : new Date(v));
            const dates = values.map(toDate);
            const minD = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
            const maxD = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
            axisDomain = [minD, maxD];
          }
        }
        
        // Use color field if present, otherwise use manual color or default
        const tickStroke = colorColumnName || manualColor || DEFAULT_CHART_COLOR;
        
        // Create configurations for tick marks and hover dots
        if (barOrientation === 'barX') {
          const tickConfig = { x: dimCol, y: categoryColumnName || (() => categories[0]), stroke: tickStroke, strokeWidth: 1.5 };
          const hoverDotConfig = { x: dimCol, y: categoryColumnName || (() => categories[0]), r: 6, fill: 'transparent', stroke: 'transparent', strokeWidth: 0 };
          options = {
            x: axisDomain ? { label: dimCol, domain: axisDomain as any, nice: false, grid: true } : { label: dimCol, grid: true },
            y: { label: categoryColumnName || ' ', type: 'band' as any, domain: categories as any, padding: bandPadding as any },
            marks: [Plot.tickX(cellData, tickConfig), Plot.dot(cellData, hoverDotConfig)]
          } as Plot.PlotOptions;
        } else {
          const tickConfig = { y: dimCol, x: categoryColumnName || (() => categories[0]), stroke: tickStroke, strokeWidth: 1.5 };
          const hoverDotConfig = { y: dimCol, x: categoryColumnName || (() => categories[0]), r: 6, fill: 'transparent', stroke: 'transparent', strokeWidth: 0 };
          options = {
            y: axisDomain ? { label: dimCol, domain: axisDomain as any, nice: false, grid: true } : { label: dimCol, grid: true },
            x: { label: categoryColumnName || ' ', type: 'band' as any, domain: categories as any, padding: bandPadding as any },
            marks: [Plot.tickY(cellData, tickConfig), Plot.dot(cellData, hoverDotConfig)]
          } as Plot.PlotOptions;
        }
        
        // Add color scale configuration if color field is present
        if (colorColumnName && sharedDomains.colorScale) {
          const colorScale = sharedDomains.colorScale;
          const colorConfig = colorScale.kind === 'continuous'
            ? {
                type: 'linear' as const,
                domain: colorScale.domain as [number, number],
                range: colorScale.range,
                clamp: true,
                label: colorField?.columnName,
              }
            : {
                type: 'ordinal' as const,
                domain: colorScale.domain as any[],
                range: colorScale.range,
                label: colorField?.columnName,
              };
          (options as any).color = colorConfig;
        }
        
        // Add custom tooltip configuration
        const mainFields: { label: string; column: string }[] = [{ label: dimCol, column: dimCol }];
        if (categoryColumnName) {
          mainFields.push({ label: categoryColumnName, column: categoryColumnName });
        }
        (options as any).__customTooltip = {
          enabled: true,
          data: cellData,
          getFields: createTooltipFieldsGetter(
            mainFields,
            colorField || undefined,
            undefined, // No size field for tick strips
            cellContext.tooltipFields
          )
        };
        
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
    const { xFields, yFields, colorField, sizeField, manualSize, manualColor } = context;
    
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
    
  // BAR path: Use coordinator with bar cell generator
  if (barOrientation && categoryAxis) {
    // Compute global band padding from size field if provided (applied to all facets)
    const globalBandPadding = computeBandPaddingFromSizeField(context.queryResult.rows, sizeField, {
      manualSize,
    }) ?? BAND_PADDING;
    
    // Get label configuration
    const labelCfg = buildLabelCfg(context);
    
    // Check if any measure has sorting enabled and apply it globally (across all facets)
    let sortedCategoryDomain = sharedCategoryDomain || [];
    const orientedFields = barOrientation === 'barX' ? xFields : yFields;
    const measures = orientedFields.filter(f => f.type === 'measure');
    const measureWithSort = measures.find(m => (m as any).barSortOrder && (m as any).barSortOrder !== 'none');
    
    if (measureWithSort && categoryField && sortedCategoryDomain.length > 0) {
      const measureName = resolveMeasureAlias(measureWithSort);
      const categoryColumnName = getFieldColumnName(categoryField);
      
      // Sort using the FULL dataset (all facets combined) to get a consistent order
      sortedCategoryDomain = sortCategoriesByValue(
        sortedCategoryDomain,
        context.queryResult.rows,
        categoryColumnName,
        measureName,
        (measureWithSort as any).barSortOrder
      );
    }
    
    // Create a specialized cell generator for multi-measure bar charts
    const barCellGen = createBarCellGenerator(
      xFields,
      yFields,
      barOrientation,
      categoryAxis,
      categoryField,
      sortedCategoryDomain,
      colorField,
      globalBandPadding,
      labelCfg,
      manualColor,
      context.tooltipFields
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
    // Create a modified context with filtered data and global shared domains
    const localContext: ChartGenerationContext = {
      ...cellContext,
      queryResult: { ...cellContext.queryResult, rows: cellData },
      // Pass shared domains so Cartesian grid generation uses them instead of computing from cell data
      sharedDomainsOverride: {
        measure: sharedDomains.measure,
        numeric: sharedDomains.numeric,
      },
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
    sharedCategoryDomain?: any[]
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
      let next = applySharedDomains(opts, sharedDomains);
      
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
      
      // No bar-specific coercion here; bar domains are handled centrally in barCore.
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

