// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { ChartGenerationContext, PlotResult, LabelConfig } from './types';
import { GridResultModel } from './gridModel';
import { buildGridFromPlotResult } from './buildGridFromPlotResult';
import { barUnified } from './chartTypes/barUnified';
import { generateChartOptions as genChartOptionsRule } from './rules/chartRules';
import { Field } from '../types';
import { computeSharedDomainsFromContext, buildLabelConfig } from './utils/configBuilder';
import { analyzeFields } from './analysis/fieldAnalysis';
import { ChartTypeOverrides } from './helpers/chartTypeResolver';
import { getChartTypeDescriptor, GRID_PLOT_CHART_TYPE_ORDER } from './chartTypeRegistry';
import { planFacets } from './faceting/facetPlanner';
import { normalizeTimelineData, getResultColumnName, getFieldDisplayName } from '../utils/fieldUtils';
import { generateCartesianPlots } from './grid/coreGridGenerator';
import { generateFacetedGrid, generateCdfGrid, generateDensityGrid } from './faceting/facetGenerator';
import { ganttChart } from './chartTypes/ganttChart';
import { generatePieGrid } from './chartTypes/pieChart';
import { generateHeatmapGrid } from './chartTypes/heatmapChart';
import { generateTableGrid, TableGridInput } from './chartTypes/tableGrid';
import { isTablePresentation } from './chartTypes/chartTypePresentation';
import { resolveContextColorChannel } from './utils/colorSchemeUtils';

// Re-export buildLabelConfig as buildLabelCfg for backward compatibility
export { buildLabelConfig as buildLabelCfg } from './utils/configBuilder';

/**
 * Grid-level generators for the chart types that bypass the per-pair cell
 * pipeline and emit a PlotResult directly. Keyed by UserChartType. The registry
 * (`chartTypeRegistry`) decides *whether* a type is active/allowed; this map
 * holds *how* it renders, keeping generator references in the rendering layer.
 */
const GRID_PLOT_GENERATORS: Partial<Record<string, (ctx: ChartGenerationContext) => PlotResult>> = {
  cdf: generateCdfGrid,
  density: generateDensityGrid,
  pie: generatePieGrid,
  heatmap: generateHeatmapGrid,
};

function tableGridInputFromContext(context: ChartGenerationContext): TableGridInput {
  return {
    xFields: context.xFields,
    yFields: context.yFields,
    rows: Array.isArray(context.queryResult?.rows) ? context.queryResult.rows : [],
    color: resolveContextColorChannel(context),
    sizeField: context.sizeField,
    sizeRange: context.sizeRange,
    manualSize: context.manualSize,
    shapeField: context.shapeField,
    manualShape: context.manualShape,
    labelFields: context.labelFields,
    fieldAliasLookup: context.fieldAliasLookup,
    tablePage: context.tablePage,
    tablePageSize: context.tablePageSize,
  };
}

/**
 * Enrich a field with its display alias from the alias lookup map.
 * Returns a new field object if an alias exists, otherwise returns the original field.
 */
function enrichFieldWithAlias(field: Field | undefined, aliasLookup?: Record<string, string>): Field | undefined {
  if (!field || !aliasLookup) return field;
  const alias = aliasLookup[field.columnName];
  if (alias && alias !== field.displayAlias) {
    return { ...field, displayAlias: alias };
  }
  return field;
}

/**
 * Enrich an array of fields with their display aliases from the alias lookup map.
 */
function enrichFieldsWithAliases(fields: Field[], aliasLookup?: Record<string, string>): Field[] {
  if (!aliasLookup || Object.keys(aliasLookup).length === 0) return fields;
  return fields.map(f => enrichFieldWithAlias(f, aliasLookup) as Field);
}

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
  labelCfg?: LabelConfig,
  _overrides?: ChartTypeOverrides
): PlotResult {
  const { queryResult, sizeField, fieldAliasLookup } = context;
  const data = queryResult.rows;
  
  // Use the first continuous field as the timeline
  const timelineField = timelineCandidates.find(f => f.flavour === 'continuous');
  if (!timelineField) {
    // Fallback - shouldn't happen given the guard in caller
    return createMessageChart('No continuous field for Gantt timeline.');
  }
  
  const startColumn = getResultColumnName(timelineField);
  const startLabel = getFieldDisplayName(timelineField, fieldAliasLookup);
  
  // Get duration from size field if present
  const durationColumn = sizeField ? getResultColumnName(sizeField) : undefined;
  const durationLabel = sizeField ? getFieldDisplayName(sizeField, fieldAliasLookup) : undefined;
  
  // Resolve column names (handle aggregation aliases)
  const resolvedStartColumn = data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], startColumn) 
    ? startColumn 
    : timelineField.columnName;
  const resolvedDurationColumn = durationColumn && data.length > 0 
    ? (Object.prototype.hasOwnProperty.call(data[0], durationColumn) ? durationColumn : sizeField?.columnName)
    : undefined;
  
  // Call ganttChart with positional arguments
  // ganttChart(context, orientation, startColumn, durationColumn?, categoryColumn?, labels?, sharedDomains?, zoomLevel?, labelCfg?)
  const result = ganttChart(
    context,
    orientation,
    resolvedStartColumn,
    resolvedDurationColumn,
    undefined, // No category - ganttChart will use () => ' '
    { start: startLabel, duration: durationLabel, category: undefined },
    undefined, // No shared domains for single-axis
    1.0, // Default zoom level
    labelCfg // Pass label configuration
  );
  
  // Sizing for single-axis Gantt:
  // - Timeline direction: use 'fr' to fill available space (user can scroll if needed via future zoom)
  // - Category direction: use a fixed reasonable size for single-row (not 'fr' which would make bars too thick)
  const thicknessScale = context.bandThicknessScale ?? 1;
  const SINGLE_ROW_HEIGHT = 60 * thicknessScale; // Scaled height for a single-row Gantt
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
  const { xFields, yFields, queryResult, sizeField, sizeRange, manualSize } = context;
  const color = resolveContextColorChannel(context);
  const colorField = color.field ?? undefined;
  const analysis = analyzeFields(xFields, yFields);

  // If CDF was selected but the guard failed (shouldn't reach here normally,
  // since generatePlot handles CDF before calling generatePlotCore), clear it
  // so downstream logic uses auto-detect instead of trying to render a CDF
  // cell chart with non-CDF data.
  if (context.globalChartType === 'cdf') {
    context = { ...context, globalChartType: null };
  }
  if (context.globalChartType === 'density') {
    context = { ...context, globalChartType: null };
  }

  // Build candidate lists for cartesian pairing, preserving the original field order
  // Only include continuous dimensions and measures (discrete dimensions are handled by faceting)
  // EXCEPTION: For Gantt charts, include discrete dimensions only on the category axis
  const isGanttSelected = context.globalChartType === 'gantt';
  const xHasContinuous = xFields.some((f) => f.flavour === 'continuous');
  const yHasContinuous = yFields.some((f) => f.flavour === 'continuous');
  const ganttCategoryAxis: 'x' | 'y' | null = isGanttSelected
    ? (xHasContinuous && !yHasContinuous ? 'y' : (!xHasContinuous && yHasContinuous ? 'x' : 'y'))
    : null;
  const ganttCategoryFieldId = ganttCategoryAxis === 'x'
    ? [...xFields].reverse().find((f) => f.type === 'dimension' && f.flavour === 'discrete')?.id
    : ganttCategoryAxis === 'y'
      ? [...yFields].reverse().find((f) => f.type === 'dimension' && f.flavour === 'discrete')?.id
      : undefined;
  
  const xCandidates: Field[] = xFields.filter((f: Field) => 
    f.type === 'measure' || 
    (f.type === 'dimension' && f.flavour === 'continuous') ||
    (ganttCategoryAxis === 'x' && f.id === ganttCategoryFieldId)
  );
  const yCandidates: Field[] = yFields.filter((f: Field) => 
    f.type === 'measure' || 
    (f.type === 'dimension' && f.flavour === 'continuous') ||
    (ganttCategoryAxis === 'y' && f.id === ganttCategoryFieldId)
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
        color: {
          field: color.field,
          scheme: color.scheme,
          bias: color.bias,
          reversed: color.reversed,
          manual: color.manual,
        },
        size: { field: sizeField, range: sizeRange, manual: manualSize, scaleData: queryResult.rows },
        shape: { field: context.shapeField, manual: context.manualShape },
      },
      labels: labelCfg,
      tooltipFields: context.tooltipFields,
      facetFields: context.facetFields,
      overrides,
      fieldOverrides: context.fieldOverrides,
      fieldOverrideTargets: context.fieldOverrideTargets,
      allFields: [...xFields, ...yFields, ...(colorField ? [colorField] : []), ...(sizeField ? [sizeField] : []), ...(context.shapeField ? [context.shapeField] : [])],
      globalChartType: context.globalChartType,
      lineVariant: context.lineVariant,
      areaFillOpacity: context.areaFillOpacity,
      lineColorMode: context.lineColorMode,
      distributionVariant: context.distributionVariant,
      measureValuesSourceFields: context.measureValuesSourceFields,
      bandThicknessScale: context.bandThicknessScale,
      ganttZoomRange: context.ganttZoomRange,
      overlays: context.overlays,
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
 * Internal chart generation that returns the legacy `PlotResult` used by the
 * faceting / chart-type pipeline. Public callers should use `generatePlot`,
 * which collapses this into a `GridResultModel` at the boundary.
 */
function generatePlotAsResult(context: ChartGenerationContext, overrides?: ChartTypeOverrides): PlotResult {
  const { xFields, yFields, queryResult, sizeField, fieldAliasLookup } = context;
  const color = resolveContextColorChannel(context);
  const colorField = color.field ?? undefined;

  // Validate inputs
  if (xFields.length === 0 && yFields.length === 0) {
    return createMessageChart('Drag fields to the axes to create a chart.');
  }

  if (!queryResult?.rows || queryResult.rows.length === 0) {
    return createMessageChart('No data available.');
  }

  // Enrich all fields with their display aliases from the lookup map
  // This ensures aliases are available throughout the chart generation pipeline
  const enrichedXFields = enrichFieldsWithAliases(xFields, fieldAliasLookup);
  const enrichedYFields = enrichFieldsWithAliases(yFields, fieldAliasLookup);
  const enrichedColorField = enrichFieldWithAlias(colorField, fieldAliasLookup);
  const enrichedSizeField = enrichFieldWithAlias(sizeField, fieldAliasLookup);
  const enrichedTooltipFields = context.tooltipFields 
    ? enrichFieldsWithAliases(context.tooltipFields, fieldAliasLookup) 
    : undefined;
  const enrichedLabelFields = context.labelFields
    ? enrichFieldsWithAliases(context.labelFields, fieldAliasLookup)
    : undefined;
  const enrichedFacetFields = context.facetFields
    ? enrichFieldsWithAliases(context.facetFields, fieldAliasLookup)
    : undefined;

  // Normalize timeline datetime fields: convert epoch numbers → Date objects
  // so Observable Plot uses time scales (with proper date formatting) instead of linear numeric scales.
  const allFields: Field[] = [
    ...enrichedXFields,
    ...enrichedYFields,
    ...(enrichedColorField ? [enrichedColorField] : []),
    ...(enrichedSizeField ? [enrichedSizeField] : []),
    ...(context.shapeField ? [context.shapeField] : []),
  ];
  const normalizedRows = normalizeTimelineData(queryResult.rows, allFields);
  const normalizedQueryResult = normalizedRows !== queryResult.rows
    ? { ...queryResult, rows: normalizedRows }
    : queryResult;

  // Apply default color if no color field present
  // Use enriched fields throughout the context
  let effectiveContext: ChartGenerationContext = {
    ...context,
    xFields: enrichedXFields,
    yFields: enrichedYFields,
    queryResult: normalizedQueryResult,
    color: { ...color, field: enrichedColorField ?? null },
    sizeField: enrichedSizeField,
    tooltipFields: enrichedTooltipFields,
    labelFields: enrichedLabelFields,
    facetFields: enrichedFacetFields,
    distributionVariant: context.distributionVariant,
  };

  try {
    // ── Grid-level chart types ──────────────────────────────────────────
    // These types (cdf, density, pie, heatmap) bypass the standard
    // facet/cell-pair pipeline and emit a PlotResult via a dedicated grid
    // generator. The registry decides whether the current axis configuration
    // is allowed; types flagged `clearWhenNotAllowed` (pie) reset to
    // auto-detect when their configuration is invalid.
    for (const chartTypeId of GRID_PLOT_CHART_TYPE_ORDER) {
      if (effectiveContext.globalChartType !== chartTypeId) continue;
      const descriptor = getChartTypeDescriptor(chartTypeId);
      const generator = GRID_PLOT_GENERATORS[chartTypeId];
      if (
        descriptor &&
        generator &&
        descriptor.isAllowed(effectiveContext.xFields, effectiveContext.yFields, effectiveContext.color?.field)
      ) {
        return generator(effectiveContext);
      }
      if (descriptor?.clearWhenNotAllowed) {
        effectiveContext = { ...effectiveContext, globalChartType: null };
      }
      break;
    }

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
        // Horizontal Gantt: last Y discrete becomes category, rest are facets
        adjustedFacetPlan = {
          ...facetPlan,
          rowFacetFields: facetPlan.rowFacetFields.slice(0, -1), // Remove last for category axis
        };
      } else if (yHasContinuous && !xHasContinuous && facetPlan.colFacetFields.length > 0) {
        // Vertical Gantt: last X discrete becomes category, rest are facets
        adjustedFacetPlan = {
          ...facetPlan,
          colFacetFields: facetPlan.colFacetFields.slice(0, -1), // Remove last for category axis
        };
      }
    }
    
    let result: PlotResult;

    // Only engage faceting when there are discrete fields that should become facets
    if (adjustedFacetPlan && ((adjustedFacetPlan.rowFacetFields?.length || 0) > 0 || (adjustedFacetPlan.colFacetFields?.length || 0) > 0)) {
      result = generateFacetedGrid(effectiveContext, adjustedFacetPlan);
    } else {
      // Delegate to core chart generation logic
      result = generatePlotCore(effectiveContext, overrides);
    }

    // Inject the color category field name into each plot's options so
    // ObservablePlot can stamp per-element `data-cat` attributes after
    // rendering.  This enables the series-highlight hook to match by
    // category value instead of fill colour (which breaks when the
    // palette wraps and multiple categories share the same colour).
    if (effectiveContext.color?.field?.flavour === 'discrete') {
      const colorCatField = getResultColumnName(effectiveContext.color.field);
      for (const plot of result.plots) {
        (plot.options as any).__colorCategoryField = colorCatField;
      }
    }

    return result;

  } catch (error) {
    console.error('Chart generation failed:', error);
    return createMessageChart(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main entry point for chart generation from the UI.
 *
 * Internally the pipeline still threads a `PlotResult` between faceting and
 * chart-type helpers; the boundary translation to the canonical
 * `GridResultModel` happens here so downstream consumers only depend on the
 * grid abstraction.
 *
 * Chart types whose presentation is `'table'` (e.g. `'table-refactor'`) bypass
 * the legacy pipeline entirely and emit a `GridResultModel` directly via their
 * own generator (`generateTableGrid` for table-refactor today).
 *
 * @param context - Chart generation context with fields, data, and styling
 * @param overrides - Optional chart type overrides for specific fields
 * @returns GridResultModel with cell array, layout and optional headers
 */
export function generatePlot(context: ChartGenerationContext, overrides?: ChartTypeOverrides): GridResultModel {
  if (isTablePresentation(context.globalChartType)) {
    return generateTableGrid(tableGridInputFromContext(context));
  }
  return buildGridFromPlotResult(generatePlotAsResult(context, overrides));
}

/**
 * Chart generation for faceting system.
 * Skips validation and faceting (already handled by faceting coordinator).
 *
 * Returns the internal `PlotResult` shape so the faceting coordinator can
 * stitch per-cell results back together; only `generatePlot` performs the
 * final boundary translation to `GridResultModel`.
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
