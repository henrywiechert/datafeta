// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Centralized DateTime normalization for chart categories/domains.
 * Wraps typed value model to provide domain/data normalization and tick formatting
 * for date-like categorical (band) axes.
 */
import { normalizeDateTimeForBand } from './dateTimeValueModel';

export type CategoryNormalizationResult = {
  domain?: any[];
  rows: any[];
  tickFormat?: (d: any) => string;
  hasDateLike: boolean;
};

export type CategoryNormalizationArgs = {
  domain?: any[];
  rows?: any[];
  categoryColumn?: string;
};

/**
 * Normalize a category domain/data for charts. Adds a tick formatter when date-like values exist.
 * Currently focused on band scales with date-like categories.
 */
export function normalizeCategoryForChart(args: CategoryNormalizationArgs): CategoryNormalizationResult {
  return normalizeDateTimeForBand(args);
}

export { normalizeDateTimeForBand };
