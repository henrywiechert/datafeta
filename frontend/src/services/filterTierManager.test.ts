// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { FilterTierManager } from './filterTierManager';

jest.mock('./columnCacheManager', () => ({
  columnCacheManager: {
    getCachedColumns: jest.fn(() => []),
  },
}));

describe('FilterTierManager.buildRefinementWhereClause', () => {
  test('builds LIKE SQL for discrete pattern mode', () => {
    const manager = new FilterTierManager();

    const sql = manager.buildRefinementWhereClause({
      category: {
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%Books%',
        patternOperator: 'like',
      },
    });

    expect(sql).toBe('CAST("category" AS VARCHAR) LIKE \'%Books%\'');
  });

  test('builds inverse ILIKE SQL for discrete pattern mode', () => {
    const manager = new FilterTierManager();

    const sql = manager.buildRefinementWhereClause({
      category: {
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '%books%',
        patternOperator: 'ilike',
        isInversePattern: true,
      },
    });

    expect(sql).toBe('CAST("category" AS VARCHAR) NOT ILIKE \'%books%\'');
  });

  test('skips discrete pattern mode when the pattern is empty', () => {
    const manager = new FilterTierManager();

    const sql = manager.buildRefinementWhereClause({
      category: {
        columnName: 'category',
        type: 'discrete',
        matchMode: 'pattern',
        pattern: '   ',
        patternOperator: 'like',
      },
    });

    expect(sql).toBe('');
  });
});