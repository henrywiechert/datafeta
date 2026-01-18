import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult, LabelConfig } from './types';
import { barUnified } from './chartTypes/barUnified';
import { generateChartOptions as genChartOptionsRule } from './rules/chartRules';
import { Field } from '../types';
import { computeSharedDomainsFromContext, buildLabelConfig } from './utils/configBuilder';
import { analyzeFields } from './analysis/fieldAnalysis';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';
import { planFacets } from './faceting/facetPlanner';
import { normalizeTimelineData, getResultColumnName, getFieldDisplayName } from '../utils/fieldUtils';
import { generateCartesianPlots } from './grid/coreGridGenerator';
import { generateFacetedGrid } from './faceting/facetGenerator';
import { ganttChart } from './chartTypes/ganttChart';

// Re-export buildLabelConfig as buildLabelCfg for backward compatibility
export { buildLabelConfig as buildLabelCfg } from './utils/configBuilder';

/**
 * Create a simple message chart (as 1x1 grid)
 */
function createMessageChart(message: string): PlotResult {
  return {
    library: 'observable-plot',
    plots: [{
      id: 'message',
      title: '',
      options: {
        marks: [
          Plot.text([message], {
            frameAnchor: "middle",
            fontSize: 14,
            fill: "gray"
          })
        ]
      },
      position: { row: 0, col: 0 }
    }],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr']
    }
  };
}

/**
 * Helper to generate a single-axis Gantt chart (no category dimension).
 * Creates a 1x1 grid with a Gantt chart using a synthetic single category.
 */
function generateSingleAxisGantt(
  context: ChartGenerationContext,
  timelineCandidates: Field[],
  orientation: 'x' | 'y',
  _labelCfg?: LabelConfig,
  _overrides?: ChartTypeOverrides
): PlotResult {
  const { queryResult, sizeField } = context;
  const data = queryResult.rows;
  
  // Use the first continuous field as the timeline
  const timelineField = timelineCandidates.find(f => f.flavour === 'continuous');
  if (!timelineField) {
    // Fallback - shouldn't happen given the guard in caller
    return createMessageChart('No continuous field for Gantt timeline.');
  }
  
  const startColumn = getResultColumnName(timelineField);
  const startLabel = getFieldDisplayName(timelineField);
  
  // Get duration from size field if present
  const durationColumn = sizeField ? getResultColumnName(sizeField) : undefined;
  const durationLabel = sizeField ? getFieldDisplayName(sizeField) : undefined;
  
  // Resolve column names (handle aggregation aliases)
  const resolvedStartColumn = data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], startColumn) 
    ? startColumn 
    : timelineField.columnName;
  const resolvedDurationColumn = durationColumn && data.length > 0 
    ? (Object.prototype.hasOwnProperty.call(data[0], durationColumn) ? durationColumn : sizeField?.columnName)
    : undefined;
  
  // Call ganttChart with positional arguments
  // ganttChart(context, orientation, startColumn, durationColumn?, categoryColumn?, labels?, sharedDomains?, zoomLevel?)
  const result = ganttChart(
    context,
    orientation,
    resolvedStartColumn,
    resolvedDurationColumn,
    undefined, // No category - ganttChart will use () => ' '
    { start: startLabel, duration: durationLabel, category: undefined },
    undefined, // No shared domains for single-axis
    1.0 // Default zoom level
  );
  
  // Sizing for single-axis Gantt:
  // - Timeline direction: use 'fr' to fill available space (user can scroll if needed via future zoom)
  // - Category direction: use a fixed reasonable size for single-row (not 'fr' which would make bars too thick)
  const SINGLE_ROW_HEIGHT = 60; // Reasonable height for a single-row Gantt
  const columnSize: number | 'fr' = orientation === 'x' ? 'fr' : SINGLE_ROW_HEIGHT;
  const rowSize: number | 'fr' = orientation === 'y' ? 'fr' : SINGLE_ROW_HEIGHT;
  
  return {
    library: 'observable-plot',
    plots: [{
      id: 'gantt-single',
      title: startLabel,
      options: result.options,
      position: { row: 0, col: 0 }
    }],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: [columnSize],
      rowSizes: [rowSize],
    }
  };
}

/**
 * Core chart generation logic (internal function).
 * Always returns grid layout with plots array, treating 1x1 as a grid.
 * 
 * This is the unified logic shared by both generatePlot and baseGeneratePlot.
 * - Analyzes fields to determine chart type
 * - Builds cartesian grids for candidate pairs
 * - Handles multi-measure scenarios
 * - Delegates to single-chart rules when needed
 * - Always returns grid layout format (no 'single' type)
 * 
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns PlotResult with plots array and grid layout
 */
function generatePlotCore(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  const { xFields, yFields, queryResult, colorField, colorScheme, sizeField, sizeRange, manualSize } = context;
  const analysis = analyzeFields(xFields, yFields);

  // Build candidate lists for cartesian pairing, preserving the original field order
  // Only include continuous dimensions and measures (discrete dimensions are handled by faceting)
  // EXCEPTION: For Gantt charts, include discrete dimensions as category axis (similar to bar charts)
  const isGanttSelected = context.globalChartType === 'gantt';
  
  const xCandidates: Field[] = xFields.filter((f: Field) => 
    f.type === 'measure' || 
    (f.type === 'dimension' && f.flavour === 'continuous') ||
    (isGanttSelected && f.type === 'dimension' && f.flavour === 'discrete')
  );
  const yCandidates: Field[] = yFields.filter((f: Field) => 
    f.type === 'measure' || 
    (f.type === 'dimension' && f.flavour === 'continuous') ||
    (isGanttSelected && f.type === 'dimension' && f.flavour === 'discrete')
  );

  const labelCfg = buildLabelConfig(context);

  // Special case: Gantt chart with only timeline axis (no category dimension)
  // Create a synthetic single-row Gantt by routing through the cartesian grid with a placeholder Y
  if (isGanttSelected && xCandidates.length > 0 && yCandidates.length === 0) {
    // Check if X has a continuous dimension (timeline)
    const hasTimelineOnX = xCandidates.some(f => f.flavour === 'continuous');
    if (hasTimelineOnX) {
      // Route to Gantt handler directly via generateCartesianPlots with empty yCandidates handling
      // The ganttChart handler supports no category (uses () => ' ')
      return generateSingleAxisGantt(context, xCandidates, 'x', labelCfg, overrides);
    }
  }
  // Vertical Gantt with only Y timeline (no X category)
  if (isGanttSelected && yCandidates.length > 0 && xCandidates.length === 0) {
    const hasTimelineOnY = yCandidates.some(f => f.flavour === 'continuous');
    if (hasTimelineOnY) {
      return generateSingleAxisGantt(context, yCandidates, 'y', labelCfg, overrides);
    }
  }

  // ALWAYS build a cartesian grid when we have candidates on both axes (including 1x1)
  if (xCandidates.length > 0 && yCandidates.length > 0) {
    // Use the unified domain computation function
    const sharedDomains = computeSharedDomainsFromContext(context, {
      xFields: xCandidates,
      yFields: yCandidates,
    });

    const plots = generateCartesianPlots({
      data: queryResult.rows,
      xCandidates,
      yCandidates,
      sharedDomains,
      encoding: {
        color: { field: colorField, scheme: colorScheme, bias: context.colorBias, manual: context.manualColor },
        size: { field: sizeField, range: sizeRange, manual: manualSize },
      },
      labels: labelCfg,
      tooltipFields: context.tooltipFields,
      facetFields: context.facetFields,
      overrides,
      fieldOverrides: context.fieldOverrides,
      fieldOverrideTargets: context.fieldOverrideTargets,
      allFields: [...xFields, ...yFields, ...(colorField ? [colorField] : []), ...(sizeField ? [sizeField] : [])],
      globalChartType: context.globalChartType,
      measureValuesSourceFields: context.measureValuesSourceFields,
    });

    // Determine column/row sizes from plots
    const columnSizes: Array<number | 'fr'> = Array.from({ length: xCandidates.length }, (_, c) => {
      const sample = plots.find((p) => p.position?.col === c);
      const w = (sample as any)?.options?.width;
      return typeof w === 'number' ? w : 'fr';
    });
    const rowSizes: Array<number | 'fr'> = Array.from({ length: yCandidates.length }, (_, r) => {
      const sample = plots.find((p) => p.position?.row === r);
      const h = (sample as any)?.options?.height;
      return typeof h === 'number' ? h : 'fr';
    });

    return {
      library: 'observable-plot',
      plots,
      sharedDomains: { byMeasure: sharedDomains.measure as any },
      layout: {
        type: 'grid',
        columns: xCandidates.length,
        rows: yCandidates.length,
        columnSizes,
        rowSizes,
      },
    };
  }

  // Multi-continuous fields on same axis → stacked grid (bars/tick strips)
  // EXCEPT when opposite axis has continuous fields → falls through to cartesian grid
  if (analysis.isMultiContinuousOnSameAxis) {
    // Determine which axis has the multiple continuous fields
    const xContinuousMeasures = (analysis.xMeasures || []).filter((m: any) => m.flavour === 'continuous');
    const xContinuousDims = (analysis.xDimensions || []).filter((d: any) => d.flavour === 'continuous');
    
    const multiOnX = (xContinuousMeasures.length + xContinuousDims.length) > 1;
    const oppositeDims = multiOnX ? analysis.yDimensions : analysis.xDimensions;
    const hasOppositeContinuousDim = Array.isArray(oppositeDims) && oppositeDims.some((d: any) => d.flavour === 'continuous');
    
    if (!hasOppositeContinuousDim) {
      try {
        return barUnified(context, labelCfg);
      } catch (error) {
        console.warn('Stacked grid generation failed, falling back:', error);
        // fall through to single-chart rules
      }
    }
  }

  // Single pair or single-axis scenarios → delegate to chartRules
  // chartRules will also return grid format after we update it
  const result = genChartOptionsRule(analysis, context, labelCfg);
  return result;
}

/**
 * Simple, direct Observable Plot generation
 * No complex pipeline - just analyze fields and generate chart directly
 */
/**
 * Main entry point for chart generation from the UI.
 * Validates inputs, handles faceting, then delegates to core logic.
 * 
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns PlotResult with plots array and grid layout
 */
export function generatePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  const { xFields, yFields, queryResult, colorField, manualColor, sizeField } = context;

  // Validate inputs
  if (xFields.length === 0 && yFields.length === 0) {
    return createMessageChart('Drag fields to the axes to create a chart.');
  }

  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return createMessageChart('No data available.');
  }

  // Normalize timeline datetime fields: convert epoch numbers → Date objects
  // so Observable Plot uses time scales (with proper date formatting) instead of linear numeric scales.
  const allFields: Field[] = [
    ...xFields,
    ...yFields,
    ...(colorField ? [colorField] : []),
    ...(sizeField ? [sizeField] : []),
  ];
  const normalizedRows = normalizeTimelineData(queryResult.rows, allFields);
  const normalizedQueryResult = normalizedRows !== queryResult.rows
    ? { ...queryResult, rows: normalizedRows }
    : queryResult;

  // Apply default color if no color field present
  const effectiveContext: ChartGenerationContext = {
    ...context,
    queryResult: normalizedQueryResult,
    colorField,
    manualColor,
  };

  try {
    // Check if faceting is applicable
    // EXCEPTION: For Gantt charts, don't facet the first discrete dimension - it becomes the category axis
    const facetPlan = planFacets(effectiveContext);
    const isGanttSelected = effectiveContext.globalChartType === 'gantt';
    
    // Adjust facet plan for Gantt: reserve one discrete dimension for category axis
    let adjustedFacetPlan = facetPlan;
    if (isGanttSelected && facetPlan) {
      // Determine which axis has the continuous field (timeline)
      const xHasContinuous = xFields.some(f => f.flavour === 'continuous');
      const yHasContinuous = yFields.some(f => f.flavour === 'continuous');
      
      if (xHasContinuous && !yHasContinuous && facetPlan.rowFacetFields.length > 0) {
        // Horizontal Gantt: first Y discrete becomes category, rest are facets
        adjustedFacetPlan = {
          ...facetPlan,
          rowFacetFields: facetPlan.rowFacetFields.slice(1), // Remove first for category axis
        };
      } else if (yHasContinuous && !xHasContinuous && facetPlan.colFacetFields.length > 0) {
        // Vertical Gantt: first X discrete becomes category, rest are facets
        adjustedFacetPlan = {
          ...facetPlan,
          colFacetFields: facetPlan.colFacetFields.slice(1), // Remove first for category axis
        };
      }
    }
    
    // Only engage faceting when there are discrete fields that should become facets
    if (adjustedFacetPlan && ((adjustedFacetPlan.rowFacetFields?.length || 0) > 0 || (adjustedFacetPlan.colFacetFields?.length || 0) > 0)) {
      return generateFacetedGrid(effectiveContext, adjustedFacetPlan);
    }

    // Delegate to core chart generation logic
    return generatePlotCore(effectiveContext, overrides);

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Chart generation for faceting system.
 * Skips validation and faceting (already handled by faceting coordinator).
 * 
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns PlotResult with plots array and grid layout
 */
export function baseGeneratePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  // Delegate directly to core logic without validation or faceting
  // This is used by faceting system where validation has already occurred
  return generatePlotCore(context, overrides);
}
/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
// moved to domains/measureDomains.ts

// buildLabelConfig is now in utils/configBuilder.ts and re-exported above for backward compatibility
