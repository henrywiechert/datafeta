// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { ChartGenerationContext } from '../types';
import { buildRenderPlan, buildViewSpec, ViewSpec } from '../../viewPlanner';
import { resolveContextColorChannel } from '../utils/colorSchemeUtils';

/**
 * Simplified facet plan - only specifies which fields create facets.
 * Chart-type-specific logic (bar orientation, category axis) is handled by the generator.
 */
export interface FacetPlan {
  rowFacetFields: Field[];
  colFacetFields: Field[];
}

export function planFacetsFromViewSpec(viewSpec: ViewSpec): FacetPlan | null {
  const renderPlan = buildRenderPlan(viewSpec);
  const rowFacetFields = renderPlan.panePartition.rows;
  const colFacetFields = renderPlan.panePartition.columns;

  if (rowFacetFields.length === 0 && colFacetFields.length === 0) {
    return null;
  }

  return {
    rowFacetFields,
    colFacetFields,
  };
}

/**
 * Analyzes the fields to determine which discrete dimensions should become facets.
 * 
 * Core principle: Discrete dimensions can either be:
 * 1. Facets (create multiple small charts arranged in a grid)
 * 2. Chart encodings (category axis, color, etc.) - handled by the generator
 * 
 * This function determines ONLY faceting, leaving chart-type decisions to the generator.
 * 
 * @returns A FacetPlan if faceting should be applied, otherwise null.
 */
export function planFacets(context: ChartGenerationContext): FacetPlan | null {
  if (context.viewSpec) {
    return planFacetsFromViewSpec(context.viewSpec);
  }
  const color = resolveContextColorChannel(context);

  const viewSpec = buildViewSpec({
    xAxisFields: context.xFields,
    yAxisFields: context.yFields,
    colorField: color.field,
    sizeField: context.sizeField || null,
    shapeField: context.shapeField || null,
    facetBackgroundField: context.facetBackgroundField || null,
    labelFields: context.labelFields || [],
    tooltipFields: context.tooltipFields || [],
    measureValuesSourceFields: context.measureValuesSourceFields || [],
    fieldOverrides: context.fieldOverrides || {},
    globalChartType: context.globalChartType,
    distributionVariant: context.distributionVariant,
    independentDomains: context.independentDomains,
  });

  return planFacetsFromViewSpec(viewSpec);
}

