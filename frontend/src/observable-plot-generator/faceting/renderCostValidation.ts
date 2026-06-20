// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Render-cost validation utilities.
 *
 * Extends facet validation with chart-type-aware cardinality checks for
 * mark families where high cardinality creates many DOM/SVG primitives.
 */

import { UserChartType } from '../../types';
import { lineColorSplitsSeries } from '../../utils/lineColorEncoding';
import { ChartGenerationContext } from '../types';
import { FACET_LIMIT, FacetValidationResult, validateFacetCounts } from './facetValidation';
import { FacetPlan } from './facetPlanner';
import { countUniqueValuesForField, detectBarChartConfiguration } from './facetUtils';

export const SERIES_LIMIT = 300;
export const CATEGORY_LIMIT = 300;
export const PLAIN_BAR_CATEGORY_LIMIT = 50000;
export const MARKS_LIMIT = 50000;

export type RenderCostExceededLimit =
  | FacetValidationResult['exceedsLimit']
  | 'series'
  | 'category'
  | 'marks';

export type RenderCostMarkFamily = 'point' | 'line' | 'bar' | 'other';

export interface RenderCostValidation extends Omit<FacetValidationResult, 'exceedsLimit'> {
  isValid: boolean;
  exceedsLimit: RenderCostExceededLimit;
  seriesCount: number;
  categoryCount: number;
  categoryLimit: number;
  estimatedMarks: number;
  markFamily: RenderCostMarkFamily;
}

function deriveMarkFamily(
  context: ChartGenerationContext,
  effectiveGlobalChartType: UserChartType | null,
): RenderCostMarkFamily {
  if (
    effectiveGlobalChartType === 'scatter' ||
    effectiveGlobalChartType === 'tick' ||
    effectiveGlobalChartType === 'density' ||
    effectiveGlobalChartType === 'cdf'
  ) {
    return 'point';
  }

  if (effectiveGlobalChartType === 'line') {
    return 'line';
  }

  if (effectiveGlobalChartType === 'bar' || effectiveGlobalChartType === 'gantt') {
    return 'bar';
  }

  const barDetection = detectBarChartConfiguration(context.xFields, context.yFields);
  if (barDetection.isBarOrTickStrip) {
    return 'bar';
  }

  return 'other';
}

function countSeries(context: ChartGenerationContext, markFamily: RenderCostMarkFamily): number {
  if (markFamily !== 'line') return 1;

  const colorField = context.color?.field;
  if (!lineColorSplitsSeries(colorField, context.lineColorMode)) return 1;

  return colorField ? countUniqueValuesForField(context.queryResult.rows, colorField) : 1;
}

function countCategories(context: ChartGenerationContext, markFamily: RenderCostMarkFamily): number {
  if (markFamily !== 'bar') return 0;

  const categoryField = detectBarChartConfiguration(context.xFields, context.yFields).categoryField;
  return categoryField ? countUniqueValuesForField(context.queryResult.rows, categoryField) : 0;
}

function getCategoryLimit(
  markFamily: RenderCostMarkFamily,
  totalFacets: number,
  effectiveGlobalChartType: UserChartType | null,
): number {
  return markFamily === 'bar' && effectiveGlobalChartType === 'bar' && totalFacets === 1
    ? PLAIN_BAR_CATEGORY_LIMIT
    : CATEGORY_LIMIT;
}

export function validateRenderCost(
  context: ChartGenerationContext,
  plan: FacetPlan,
  effectiveGlobalChartType: UserChartType | null,
): RenderCostValidation {
  const facetValidation = validateFacetCounts(context, plan);
  const markFamily = deriveMarkFamily(context, effectiveGlobalChartType);
  const seriesCount = countSeries(context, markFamily);
  const categoryCount = countCategories(context, markFamily);
  const totalFacets = facetValidation.rowFacetCount * facetValidation.colFacetCount;
  const categoryLimit = getCategoryLimit(markFamily, totalFacets, effectiveGlobalChartType);
  const estimatedMarks = totalFacets * Math.max(seriesCount, 1) * Math.max(categoryCount, 1);

  let exceedsLimit: RenderCostExceededLimit = facetValidation.exceedsLimit;
  if (!exceedsLimit) {
    if (markFamily === 'line' && seriesCount > SERIES_LIMIT) {
      exceedsLimit = 'series';
    } else if (markFamily === 'bar' && categoryCount > categoryLimit) {
      exceedsLimit = 'category';
    } else if ((markFamily === 'line' || markFamily === 'bar') && estimatedMarks > MARKS_LIMIT) {
      exceedsLimit = 'marks';
    }
  }

  return {
    ...facetValidation,
    isValid: exceedsLimit === null,
    exceedsLimit,
    seriesCount,
    categoryCount,
    categoryLimit,
    estimatedMarks,
    markFamily,
  };
}

export { FACET_LIMIT };
