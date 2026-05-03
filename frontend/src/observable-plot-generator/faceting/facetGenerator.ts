import { BAND_PADDING, BAR_STEP_PX, MIN_BAND_TRACKS } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext, PlotResult } from '../types';
import { uniqueValuesForField, detectBarChartConfiguration } from './facetUtils';
import { FacetPlan } from './facetPlanner';
import { SharedDomains } from './facetDomains';
import { buildLabelConfig, buildCartesianPlotsConfig } from '../utils/configBuilder';
import { coordinateFacetedGrid, CellGenerator, CellResult, FacetCellContext } from './facetCoordinator';
import { resolveMeasureAlias, computeBandPaddingFromSizeField, sortCategoriesByValue } from '../chartTypes/barCore';
import { isMeasureValuesField, combineMeasureValuesOverrides } from '../../utils/syntheticFields';
import { createBarCellGenerator } from './barFacetGenerator';
import { generateCartesianPlots } from '../grid/coreGridGenerator';
import { buildCdfOptions } from '../chartTypes/cdfChart';
import { getFieldDisplayName } from '../../utils/fieldUtils';
import { planFacets } from './facetPlanner';
import { buildCategoryTickFormatter } from '../utils/categoryTickFormatter';

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
 * Uses shared bar detection logic to ensure consistency with validation.
 */
function deriveChartConfig(
  context: ChartGenerationContext,
  plan: FacetPlan
): ChartConfig {
  const { xFields, yFields, queryResult } = context;
  const { rowFacetFields, colFacetFields } = plan;

  // Use shared detection logic for bar/tick strip charts
  const detection = detectBarChartConfiguration(xFields, yFields);
  const { barOrientation, categoryAxis, categoryField } = detection;

  let sharedCategoryDomain: any[] | null = null;

  // If we have a category axis, compute the shared domain
  if (categoryAxis) {
    if (categoryField) {
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
 * Facet planner: If there are discrete fields present, facet the base chart by up to 2 fields
 * (first → rows, second → columns). For each facet combination, we regenerate the base chart
 * on the filtered subset. Discrete fields do not directly influence base chart type, except
 * for bar charts where a category axis can be injected if needed (see below).
 */
export function generateFacetedGrid(context: ChartGenerationContext, plan: FacetPlan): PlotResult {
    const { xFields, yFields, colorField, sizeField, manualSize, manualColor, fieldOverrides, measureValuesSourceFields } = context;
    
    // Check if MeasureValues is being used and get combined overrides from source measures
    const hasMeasureValuesOnAxis = [...xFields, ...yFields].some(f => isMeasureValuesField(f));
    const combinedMeasureOverride = hasMeasureValuesOnAxis
      ? combineMeasureValuesOverrides(measureValuesSourceFields, fieldOverrides)
      : undefined;
    
    // Use combined override's manualSize if available (for MeasureValues charts)
    const effectiveManualSize = combinedMeasureOverride?.manualSize ?? manualSize;
    const effectiveManualColor = combinedMeasureOverride?.manualColor ?? manualColor;
    
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
  // Skip this path when Gantt is explicitly selected
  if (context.globalChartType !== 'gantt' && barOrientation && categoryAxis) {
    // Compute global band padding from size field if provided (applied to all facets)
    // Use effective manual size which may come from combined MeasureValues overrides
    const globalBandPadding = computeBandPaddingFromSizeField(context.queryResult.rows, sizeField, {
      manualSize: effectiveManualSize,
    }) ?? BAND_PADDING;
    
    // Get label configuration
    const labelCfg = buildLabelConfig(context);
    
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
    
    // Create tick formatter based on available pixels
    const tickFormat = categoryAxis ? buildCategoryTickFormatter(
      categoryAxis,
      undefined,
      categoryAxis === 'x' ? context.xAxisTickHeightPx : context.yAxisTickWidthPx
    ) : undefined;

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
      effectiveManualColor,
      context.tooltipFields,
      tickFormat
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
  
  // GENERIC PATH (scatter, line, etc.): Use coordinator with direct cartesian cell generator
  // This path is simpler than bar because there's no category axis complexity.
  // All discrete dimensions are used for faceting, continuous dimensions/measures go on X/Y axes.
  
  // Build candidates: only continuous dimensions and measures (discrete already used for faceting)
  // EXCEPTION: For Gantt charts, include discrete dimensions only on the category axis
  const isGanttSelected = context.globalChartType === 'gantt';
  const xHasContinuous = xFields.some(f => f.flavour === 'continuous');
  const yHasContinuous = yFields.some(f => f.flavour === 'continuous');
  const ganttCategoryAxis: 'x' | 'y' | null = isGanttSelected
    ? (xHasContinuous && !yHasContinuous ? 'y' : (!xHasContinuous && yHasContinuous ? 'x' : 'y'))
    : null;
  const ganttCategoryFieldId = ganttCategoryAxis === 'x'
    ? [...xFields].reverse().find((f) => f.type === 'dimension' && f.flavour === 'discrete')?.id
    : ganttCategoryAxis === 'y'
      ? [...yFields].reverse().find((f) => f.type === 'dimension' && f.flavour === 'discrete')?.id
      : undefined;
  const xCandidates = xFields.filter(f => 
    f.type === 'measure' || 
    (f.type === 'dimension' && f.flavour === 'continuous') ||
    (ganttCategoryAxis === 'x' && f.id === ganttCategoryFieldId)
  );
  const yCandidates = yFields.filter(f => 
    f.type === 'measure' || 
    (f.type === 'dimension' && f.flavour === 'continuous') ||
    (ganttCategoryAxis === 'y' && f.id === ganttCategoryFieldId)
  );
  
  // Create a cell generator that directly calls generateCartesianPlots
  const cartesianCellGenerator: CellGenerator = (
    cellData: any[],
    cellContext: ChartGenerationContext,
    sharedDomains: SharedDomains,
    _facetPosition: { row: number; col: number },
    facetCellContext?: FacetCellContext
  ): CellResult => {
    // Combine row and column facet fields for tooltip display
    const facetFields = facetCellContext 
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];
    
    // Build config using the factory function - much cleaner!
    const config = buildCartesianPlotsConfig(context, {
      data: cellData,
      sharedDomains,
      xCandidates,
      yCandidates,
      facetFields,
      manualColorOverride: effectiveManualColor,
      manualSizeOverride: effectiveManualSize,
    });
    
    const plots = generateCartesianPlots(config);
    
    // For Gantt charts, compute proper row/column sizes based on category count
    // This ensures facets maintain consistent height even when empty (no data in zoom range)
    // Note: Timeline axis uses 'fr' to fill available space - zoom is handled by domain, not by size
    let rowSizes: Array<number | 'fr'> | undefined;
    let columnSizes: Array<number | 'fr'> | undefined;
    
    if (isGanttSelected && ganttCategoryAxis) {
      // Get the Gantt category field
      const ganttCategoryField = ganttCategoryAxis === 'y'
        ? yCandidates.find(f => f.type === 'dimension' && f.flavour === 'discrete')
        : xCandidates.find(f => f.type === 'dimension' && f.flavour === 'discrete');
      
      if (ganttCategoryField) {
        const categoryColumnName = getFieldColumnName(ganttCategoryField);
        // Use shared categorical domain (from FULL data) to ensure consistent sizing across all facets
        const categories = sharedDomains.categorical?.[categoryColumnName] || [];
        const categoryCount = Math.max(MIN_BAND_TRACKS, categories.length);
        const thicknessScale = cellContext.bandThicknessScale ?? 1;
        const categoryAxisSize = categoryCount * BAR_STEP_PX * thicknessScale;
        
        if (ganttCategoryAxis === 'y') {
          // Horizontal Gantt: categories on Y axis, so set row height
          // Timeline axis (X) uses 'fr' - zoom is handled by the domain, not physical size
          rowSizes = Array.from({ length: yCandidates.length || 1 }, () => categoryAxisSize);
        } else {
          // Vertical Gantt: categories on X axis, so set column width
          // Timeline axis (Y) uses 'fr' - zoom is handled by the domain, not physical size
          columnSizes = Array.from({ length: xCandidates.length || 1 }, () => categoryAxisSize);
        }
      }
    }
    
    return {
      plots: plots.map(p => ({
        id: p.id,
        title: p.title,
        options: p.options,
        position: p.position,
        xField: p.xField,
        yField: p.yField,
      })),
      columns: xCandidates.length || 1,
      rows: yCandidates.length || 1,
      columnSizes,
      rowSizes,
    };
  };
  
  // For Gantt charts, identify the category field for shared domain computation
  const ganttCategoryField = isGanttSelected && ganttCategoryAxis
    ? (ganttCategoryAxis === 'y'
        ? yCandidates.find(f => f.type === 'dimension' && f.flavour === 'discrete')
        : xCandidates.find(f => f.type === 'dimension' && f.flavour === 'discrete'))
    : null;
  
  // Compute shared category domain for Gantt from FULL dataset (all facets)
  const ganttSharedCategoryDomain = ganttCategoryField
    ? uniqueValuesForField(context.queryResult.rows, ganttCategoryField)
    : undefined;
  
  // Use the coordinator for faceting
  return coordinateFacetedGrid({
    context,
    plan: { rowFacetFields: effectiveRowFacetFields, colFacetFields: effectiveColFacetFields },
    cellGenerator: cartesianCellGenerator,
    categoryField: ganttCategoryField || undefined,
    sharedCategoryDomain: ganttSharedCategoryDomain,
  });
}

/**
 * Create a CellGenerator that produces CDF charts for each continuous measure
 * on the X-axis.  Each measure becomes a column in a single-row grid.
 */
function createCdfCellGenerator(
  context: ChartGenerationContext,
): CellGenerator {
  const cdfMeasures = context.xFields.filter(
    f => f.type === 'measure' && f.flavour === 'continuous',
  );

  return (
    cellData: any[],
    _cellContext: ChartGenerationContext,
    _sharedDomains: SharedDomains,
    _facetPosition: { row: number; col: number },
    facetCellContext?: FacetCellContext,
  ): CellResult => {
    const facetFields = facetCellContext
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];

    const plots = cdfMeasures.map((measure, idx) => ({
      id: `cdf-${measure.columnName}`,
      title: getFieldDisplayName(measure, context.fieldAliasLookup),
      options: buildCdfOptions({
        data: cellData,
        valueColumn: measure.columnName,
        valueLabel: getFieldDisplayName(measure, context.fieldAliasLookup),
        colorField: context.colorField || undefined,
        colorScheme: context.colorScheme,
        colorBias: context.colorBias,
        manualColor: context.manualColor,
        manualSize: context.manualSize,
        tooltipFields: context.tooltipFields,
        facetFields,
        colorScaleInfo: _sharedDomains.colorScale,
      }),
      position: { row: 0, col: idx },
    }));

    return {
      plots,
      columns: cdfMeasures.length,
      rows: 1,
    };
  };
}

/**
 * Generate CDF chart(s), optionally faceted by discrete dimensions.
 * Integrates into the standard faceting pipeline via a CDF CellGenerator.
 */
export function generateCdfGrid(context: ChartGenerationContext): PlotResult {
  const { xFields } = context;

  const cdfMeasures = xFields.filter(
    f => f.type === 'measure' && f.flavour === 'continuous',
  );

  if (cdfMeasures.length === 0) {
    return {
      library: 'observable-plot',
      plots: [],
      layout: { type: 'grid', columns: 1, rows: 1, columnSizes: ['fr'], rowSizes: ['fr'] },
    };
  }

  const cellGen = createCdfCellGenerator(context);

  // Determine faceting from discrete dimensions on either axis
  const facetPlan = planFacets(context);
  const hasFacets = facetPlan &&
    ((facetPlan.rowFacetFields?.length || 0) > 0 ||
     (facetPlan.colFacetFields?.length || 0) > 0);

  if (hasFacets && facetPlan) {
    return coordinateFacetedGrid({
      context,
      plan: facetPlan,
      cellGenerator: cellGen,
    });
  }

  // No faceting — run the cell generator directly on the full dataset
  const result = cellGen(
    context.queryResult.rows,
    context,
    { measure: {}, numeric: {}, categorical: {} },
    { row: 0, col: 0 },
  );

  return {
    library: 'observable-plot',
    plots: result.plots,
    layout: {
      type: 'grid',
      columns: result.columns,
      rows: 1,
      columnSizes: Array(result.columns).fill('fr' as const),
      rowSizes: ['fr' as const],
    },
  };
}

