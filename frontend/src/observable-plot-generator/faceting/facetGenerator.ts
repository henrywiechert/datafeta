import * as Plot from '@observablehq/plot';
import { BAR_STEP_PX, BAND_PADDING } from '../../config/chartLayoutConfig';
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
  if (barOrientation && categoryAxis) {
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
  
  // GENERIC PATH (scatter, line, etc.): Use coordinator with direct cartesian cell generator
  // This path is simpler than bar because there's no category axis complexity.
  // All discrete dimensions are used for faceting, continuous dimensions/measures go on X/Y axes.
  
  // Build candidates: only continuous dimensions and measures (discrete already used for faceting)
  const xCandidates = xFields.filter(f => 
    f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
  );
  const yCandidates = yFields.filter(f => 
    f.type === 'measure' || (f.type === 'dimension' && f.flavour === 'continuous')
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
    
    return {
      plots: plots.map(p => ({
        id: p.id,
        title: p.title,
        options: p.options,
        position: p.position,
      })),
      columns: xCandidates.length || 1,
      rows: yCandidates.length || 1,
    };
  };
  
  // Use the coordinator for faceting
  return coordinateFacetedGrid({
    context,
    plan: { rowFacetFields: effectiveRowFacetFields, colFacetFields: effectiveColFacetFields },
    cellGenerator: cartesianCellGenerator,
  });
}

