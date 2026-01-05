import * as Plot from '@observablehq/plot';
import { BAR_STEP_PX, BAND_PADDING } from '../../config/chartLayoutConfig';
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { ChartGenerationContext, PlotResult, CategoryAxisDescriptor } from '../types';
import { uniqueValuesForField } from './facetUtils';
import { FacetPlan } from './facetPlanner';
import { baseGeneratePlot, buildLabelCfg } from '../observablePlotGenerator';
import { 
  applySharedDomains, 
  applyIntrinsicSizeFromCategoryDomain,
  SharedDomains
} from './facetDomains';
import { coordinateFacetedGrid, CellGenerator } from './facetCoordinator';
import { resolveMeasureAlias, computeBandPaddingFromSizeField, sortCategoriesByValue } from '../chartTypes/barCore';
import { isMeasureValuesField, combineMeasureValuesOverrides } from '../../utils/syntheticFields';
import { createBarCellGenerator } from './barFacetGenerator';

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
  if (barOrientation && categoryAxis) {
    // Compute global band padding from size field if provided (applied to all facets)
    // Use effective manual size which may come from combined MeasureValues overrides
    const globalBandPadding = computeBandPaddingFromSizeField(context.queryResult.rows, sizeField, {
      manualSize: effectiveManualSize,
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
      effectiveManualColor,
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
  const defaultCellGenerator: CellGenerator = (cellData, cellContext, sharedDomains, facetPosition, facetCellContext) => {
    // Combine row and column facet fields for tooltip display
    const allFacetFields = facetCellContext 
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];
    
    // Create a modified context with filtered data and global shared domains
    const localContext: ChartGenerationContext = {
      ...cellContext,
      queryResult: { ...cellContext.queryResult, rows: cellData },
      // Pass shared domains so Cartesian grid generation uses them instead of computing from cell data
      sharedDomainsOverride: {
        measure: sharedDomains.measure,
        numeric: sharedDomains.numeric,
      },
      // Pass facet fields for tooltip context
      facetFields: allFacetFields,
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
      // Preserve facetFields from the parent context for tooltip display
      facetFields: context.facetFields,
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

