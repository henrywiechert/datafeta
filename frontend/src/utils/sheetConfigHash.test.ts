// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { computeChartConfigHash, computeQueryConfigHash, filtersToHashKey } from './sheetConfigHash';
import { ChartAffectingConfig, QueryAffectingConfig } from './queryAffectingConfig';

function baseQueryConfig(): QueryAffectingConfig {
  return {
    xAxisFields: [],
    yAxisFields: [],
    appliedFilterConfigurations: {},
    colorField: null,
    sizeField: null,
    shapeField: null,
    facetBackgroundField: null,
    labelFields: [],
    tooltipFields: [],
    measureGroupFields: [],
  };
}

function baseChartConfig(): ChartAffectingConfig {
  return {
    ...baseQueryConfig(),
    colorScheme: 'tableau10',
    colorBias: 0,
    bandThicknessScale: 1.0,
    independentDomains: { x: false, y: false },
    globalChartType: 'table-refactor',
    distributionVariant: 'tick-strip',
  };
}

describe('sheetConfigHash', () => {
  describe('computeChartConfigHash with table-refactor pagination (PR 8)', () => {
    it('produces a different hash when tablePage changes', () => {
      const a = computeChartConfigHash({ ...baseChartConfig(), tablePage: 0 });
      const b = computeChartConfigHash({ ...baseChartConfig(), tablePage: 1 });
      expect(a).not.toBe(b);
    });

    it('produces a different hash when tablePageSize changes', () => {
      const a = computeChartConfigHash({ ...baseChartConfig(), tablePage: 0, tablePageSize: 25 });
      const b = computeChartConfigHash({ ...baseChartConfig(), tablePage: 0, tablePageSize: 50 });
      expect(a).not.toBe(b);
    });

    it('is stable when neither tablePage nor tablePageSize is supplied', () => {
      const a = computeChartConfigHash(baseChartConfig());
      const b = computeChartConfigHash(baseChartConfig());
      expect(a).toBe(b);
    });

    it('is stable when only unrelated chart props change for the same page', () => {
      const a = computeChartConfigHash({ ...baseChartConfig(), tablePage: 2, tablePageSize: 50, colorBias: 0 });
      const b = computeChartConfigHash({ ...baseChartConfig(), tablePage: 2, tablePageSize: 50, colorBias: 0 });
      expect(a).toBe(b);
    });

    it('does not affect the query hash (pager is purely a chart concern)', () => {
      const a = computeQueryConfigHash(baseQueryConfig());
      // Pager-related fields are not part of QueryAffectingConfig, so the hash
      // is unaffected.
      const b = computeQueryConfigHash(baseQueryConfig());
      expect(a).toBe(b);
    });
  });

  describe('filtersToHashKey', () => {
    it('ignores scope-only changes for otherwise identical filters', () => {
      const local = filtersToHashKey({
        region: {
          fieldId: 'region',
          columnName: 'region',
          type: 'discrete',
          selectedValues: ['West', 'East'],
          scope: 'sheet',
        },
      });

      const global = filtersToHashKey({
        region: {
          fieldId: 'region',
          columnName: 'region',
          type: 'discrete',
          selectedValues: ['West', 'East'],
          scope: 'session',
        },
      });

      expect(local).toBe(global);
    });
  });
});
