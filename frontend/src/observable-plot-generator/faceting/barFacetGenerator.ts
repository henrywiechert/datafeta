import * as Plot from '@observablehq/plot';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING, MIN_BAND_TRACKS, MIN_SERIES_PANES } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { SharedDomains } from './facetDomains';
import { CellGenerator, CellResult, PositionedPlot, FacetCellContext } from './facetCoordinator';
import { buildBarOptions, resolveMeasureAlias } from '../chartTypes/barCore';
import { getResultColumnName } from '../../utils/fieldUtils';
import { createLabelMark, prepareLabelData, LabelRenderConfig } from '../utils/labelUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';
import { formatDateTick } from '../utils/dateFormatUtils';
import { normalizeCategoryForChart } from '../../datetime/chartDateTimeNormalizer';
import { warnIfNonUtc } from '../../datetime/utcWarnings';

/**
 * Label configuration for bar cell generator.
 */
export interface BarLabelConfig {
  labelFields: any[];
  labelsEnabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
}

/**
 * Create a cell generator for multi-measure bar charts and tick strips.
 * This handles the special case of bar charts with multiple measures on one axis,
 * as well as continuous dimension tick strips.
 *
 * @param xFields - Fields on the X axis
 * @param yFields - Fields on the Y axis
 * @param barOrientation - Whether bars extend horizontally (barX) or vertically (barY)
 * @param categoryAxis - Which axis contains the category ('x' or 'y')
 * @param categoryField - The field used for categories (can be null for single-bar charts)
 * @param sharedCategoryDomain - Domain of category values shared across all facets
 * @param colorField - Optional color encoding field
 * @param bandPadding - Band padding for bar spacing
 * @param labelCfg - Label configuration for data labels
 * @param manualColor - Manual color override when no color field is present
 * @param tooltipFields - Additional fields to show in tooltips
 * @returns A CellGenerator function for use with the facet coordinator
 */
export function createBarCellGenerator(
  xFields: Field[],
  yFields: Field[],
  barOrientation: 'barX' | 'barY',
  categoryAxis: 'x' | 'y',
  categoryField: Field | null,
  sharedCategoryDomain: any[],
  colorField?: Field | null,
  bandPadding?: number,
  labelCfg?: BarLabelConfig,
  manualColor?: string,
  tooltipFields?: Field[]
): CellGenerator {
  return (cellData, cellContext, sharedDomains, facetPosition, facetCellContext): CellResult => {
    // Combine row and column facet fields for tooltip display
    const allFacetFields = facetCellContext 
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];
    
    const orientedFields = barOrientation === 'barX' ? xFields : yFields;
    const seriesFields = orientedFields.filter((f) => 
      f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
    );
    
    // Normalize categories: convert Date objects to formatted strings for band scale compatibility
    // Observable Plot band scales don't handle Date objects correctly, causing mismatched bars
    const rawCategories = sharedCategoryDomain && sharedCategoryDomain.length > 0 
      ? sharedCategoryDomain 
      : [' '];
    const categoryColumnName = categoryField ? getFieldColumnName(categoryField) : undefined;
    const bandNorm = normalizeCategoryForChart({ domain: rawCategories, rows: cellData, categoryColumn: categoryColumnName });
    if (bandNorm.hasDateLike) {
      warnIfNonUtc(rawCategories, 'Category domain contains offsetful datetimes');
      if (categoryColumnName) {
        const colVals = cellData.map((r) => r?.[categoryColumnName]).filter((v) => v !== undefined && v !== null);
        warnIfNonUtc(colVals, 'Category data contains offsetful datetimes');
      }
    }
    const categories = bandNorm.domain || [' '];
    const normalizedCellData = bandNorm.rows;
    
    // Calculate base dimensions based on category count
    const baseRowHeight = categoryAxis === 'y' 
      ? Math.max(BAR_STEP_PX * MIN_BAND_TRACKS, categories.length * BAR_STEP_PX) 
      : 'fr';
    const baseColWidth = categoryAxis === 'x' 
      ? Math.max(BAR_STEP_PX * MIN_BAND_TRACKS, categories.length * BAR_STEP_PX) 
      : 'fr';
    
    // Calculate grid dimensions for multi-series layouts
    const baseColsPerFacet = barOrientation === 'barX' ? Math.max(MIN_SERIES_PANES, seriesFields.length) : 1;
    const baseRowsPerFacet = barOrientation === 'barY' ? Math.max(MIN_SERIES_PANES, seriesFields.length) : 1;
    
    const plots: PositionedPlot[] = [];
    const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
    
    // Create a subplot per series
    for (let s = 0; s < Math.max(1, seriesFields.length); s++) {
      const f = seriesFields[s] || orientedFields.find((ff) => ff.type === 'measure')!;
      const isMeasure = f.type === 'measure';
      let options: Plot.PlotOptions;
      let title: string;
      
      if (isMeasure) {
        options = buildMeasureBarOptions(
          normalizedCellData,
          f,
          barOrientation,
          categoryColumnName,
          categories,
          colorField,
          colorColumnName,
          sharedDomains,
          bandPadding,
          labelCfg,
          manualColor,
          tooltipFields,
          allFacetFields
        );
        title = resolveMeasureAlias(f);
      } else {
        // Tick strip for continuous dimension
        options = buildTickStripOptions(
          normalizedCellData,
          f,
          barOrientation,
          categoryColumnName,
          categories,
          colorField,
          colorColumnName,
          sharedDomains,
          bandPadding,
          manualColor,
          cellContext.tooltipFields,
          allFacetFields
        );
        title = getResultColumnName(f);
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

// ---------- Measure Bar Chart Builder ---------------------------------------

function buildMeasureBarOptions(
  cellData: any[],
  measureField: Field,
  barOrientation: 'barX' | 'barY',
  categoryColumnName: string | undefined,
  categories: any[],
  colorField: Field | null | undefined,
  colorColumnName: string | undefined,
  sharedDomains: SharedDomains,
  bandPadding: number | undefined,
  labelCfg: BarLabelConfig | undefined,
  manualColor: string | undefined,
  tooltipFields: Field[] | undefined,
  facetFields?: Field[]
): Plot.PlotOptions {
  const measureName = resolveMeasureAlias(measureField);
  const valueDomain = (sharedDomains.measure as any)[measureName] || [0, 1];
  
  // Use the global band padding computed from size field
  const dynamicPadding = bandPadding ?? BAND_PADDING;

  // Don't use valueDomainOverride for stacked bars (no category but has color)
  // Let buildBarOptions calculate the correct stacked domain
  const useStackedDomain = !categoryColumnName && colorColumnName;

  // Note: Sorting is handled globally in generateFacetedGrid (before cell generation)
  // so all facets share the same category order.
  const sortedCategories = categories;

  // Use barCore.buildBarOptions()
  const options = buildBarOptions({
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
    facetFields: facetFields,
  });
  
  // Add labels if configured
  if (labelCfg) {
    addBarLabels(options, cellData, measureName, barOrientation, categoryColumnName, colorColumnName, labelCfg);
  }
  
  return options;
}

function addBarLabels(
  options: Plot.PlotOptions,
  cellData: any[],
  measureName: string,
  barOrientation: 'barX' | 'barY',
  categoryColumnName: string | undefined,
  colorColumnName: string | undefined,
  labelCfg: BarLabelConfig
): void {
  let labelData = cellData;
  const orientation = barOrientation === 'barX' ? 'horizontal' : 'vertical';
  
  // When categories are present AND we have color (stacked bars), use RAW data for Plot.stackY()
  // When categories are present WITHOUT color, aggregate by category only
  if (categoryColumnName && colorColumnName) {
    // For stacked bars with categories: use raw data, Plot.stackY will handle the stacking
    labelData = cellData;
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
  
  // Bars are stacked whenever we have a color field
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

// ---------- Tick Strip Builder ----------------------------------------------

function buildTickStripOptions(
  cellData: any[],
  dimensionField: Field,
  barOrientation: 'barX' | 'barY',
  categoryColumnName: string | undefined,
  categories: any[],
  colorField: Field | null | undefined,
  colorColumnName: string | undefined,
  sharedDomains: SharedDomains,
  bandPadding: number | undefined,
  manualColor: string | undefined,
  tooltipFields: Field[] | undefined,
  facetFields?: Field[]
): Plot.PlotOptions {
  const dimCol = getResultColumnName(dimensionField);
  
  // Use shared domain from sharedDomains.numeric for consistent scales across facets
  // Fall back to computing from cell data only if no shared domain exists
  let axisDomain: [number, number] | [Date, Date] | undefined = 
    sharedDomains.numeric?.[dimCol] as [number, number] | [Date, Date] | undefined;
  
  if (!axisDomain) {
    axisDomain = computeAxisDomainFromData(cellData, dimCol);
  }
  
  // Use color field if present, otherwise use manual color or default
  const tickStroke = colorColumnName || manualColor || DEFAULT_CHART_COLOR;
  
  let options: Plot.PlotOptions;
  
  // Create configurations for tick marks and hover dots
  const isTimeDomain = axisDomain?.[0] instanceof Date;

  if (barOrientation === 'barX') {
    const tickConfig = { x: dimCol, y: categoryColumnName || (() => categories[0]), stroke: tickStroke, strokeWidth: 1.5 };
    const hoverDotConfig = { x: dimCol, y: categoryColumnName || (() => categories[0]), r: 6, fill: 'transparent', stroke: 'transparent', strokeWidth: 0 };
    options = {
      x: axisDomain 
        ? {
            label: dimCol,
            domainKey: dimCol,
            domain: axisDomain,
            nice: false,
            grid: true,
            ...(isTimeDomain ? { type: 'utc' as any, tickFormat: formatDateTick } : {}),
          } as any
        : { label: dimCol, domainKey: dimCol, grid: true } as any,
      y: { label: categoryColumnName || ' ', type: 'band', domain: categories, padding: bandPadding } as any,
      marks: [Plot.tickX(cellData, tickConfig), Plot.dot(cellData, hoverDotConfig)]
    };
  } else {
    const tickConfig = { y: dimCol, x: categoryColumnName || (() => categories[0]), stroke: tickStroke, strokeWidth: 1.5 };
    const hoverDotConfig = { y: dimCol, x: categoryColumnName || (() => categories[0]), r: 6, fill: 'transparent', stroke: 'transparent', strokeWidth: 0 };
    options = {
      y: axisDomain 
        ? {
            label: dimCol,
            domainKey: dimCol,
            domain: axisDomain,
            nice: false,
            grid: true,
            ...(isTimeDomain ? { type: 'utc' as any, tickFormat: formatDateTick } : {}),
          } as any
        : { label: dimCol, domainKey: dimCol, grid: true } as any,
      x: { label: categoryColumnName || ' ', type: 'band', domain: categories, padding: bandPadding } as any,
      marks: [Plot.tickY(cellData, tickConfig), Plot.dot(cellData, hoverDotConfig)]
    };
  }
  
  // Add color scale configuration if color field is present
  if (colorColumnName && sharedDomains.colorScale) {
    addColorScaleConfig(options, colorField, sharedDomains);
  }
  
  // Add custom tooltip configuration
  addTickStripTooltip(options, cellData, dimCol, categoryColumnName, colorField, tooltipFields, facetFields);
  
  return options;
}

function computeAxisDomainFromData(
  cellData: any[],
  dimCol: string
): [number, number] | [Date, Date] | undefined {
  const isNumericOrDate = (v: any) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    v instanceof Date ||
    (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  
  const values = cellData
    .map((row: any) => row[dimCol])
    .filter((v: any) => isNumericOrDate(v));
  
  if (values.length === 0) return undefined;
  
  const sample = values[0];
  if (typeof sample === 'number') {
    const nums = values as number[];
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return [min, max];
  } else {
    const toDate = (v: any) => (v instanceof Date ? v : new Date(v));
    const dates = values.map(toDate);
    const minD = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
    const maxD = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
    return [minD, maxD];
  }
}

function addColorScaleConfig(
  options: Plot.PlotOptions,
  colorField: Field | null | undefined,
  sharedDomains: SharedDomains
): void {
  const colorScale = sharedDomains.colorScale;
  if (!colorScale) return;
  
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

function addTickStripTooltip(
  options: Plot.PlotOptions,
  cellData: any[],
  dimCol: string,
  categoryColumnName: string | undefined,
  colorField: Field | null | undefined,
  tooltipFields: Field[] | undefined,
  facetFields?: Field[]
): void {
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
      tooltipFields,
      undefined, // No excludeColumns
      facetFields
    )
  };
}

