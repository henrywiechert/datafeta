// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  collectReferencedColumnNames,
  hasCrossDatabaseUnion,
  isSchemaCheckReady,
  planDatabaseMirror,
  planDatabaseSwitch,
  rewriteUnionTablesForDatabase,
  validateSheetSchema,
} from './schemaValidation';
import { Field, Sheet } from '../types';

function field(columnName: string): Field {
  return {
    id: columnName,
    columnName,
    type: 'dimension',
    flavour: 'discrete',
    dataType: 'string',
  };
}

function sheet(overrides: Partial<Sheet['visualizationState']> = {}): Sheet {
  return {
    id: 's1',
    name: 'Sheet 1',
    createdAt: 0,
    lastModified: 0,
    visualizationState: {
      xAxisFields: [],
      yAxisFields: [],
      filterFields: [],
      filterConfigurations: {},
      appliedFilterConfigurations: {},
      colorField: null,
      colorScheme: 'tableau10',
      colorBias: 0,
      sizeField: null,
      sizeRange: [1, 10],
      manualSize: 5,
      ...overrides,
    },
  };
}

describe('schemaValidation', () => {
  test('hasCrossDatabaseUnion detects unions in other databases', () => {
    expect(
      hasCrossDatabaseUnion('analytics', [
        { database: 'analytics', table_name: 'a' },
        { database: 'other', table_name: 'b' },
      ]),
    ).toBe(true);
    expect(
      hasCrossDatabaseUnion('analytics', [
        { database: 'analytics', table_name: 'a' },
      ]),
    ).toBe(false);
  });

  test('rewriteUnionTablesForDatabase rewrites primary namespace only', () => {
    const rewritten = rewriteUnionTablesForDatabase(
      [
        { database: 'dev', table_name: 'orders' },
        { database: 'other', table_name: 'shared' },
      ],
      'dev',
      'prod',
    );
    expect(rewritten).toEqual([
      { database: 'prod', table_name: 'orders' },
      { database: 'other', table_name: 'shared' },
    ]);
  });

  test('collectReferencedColumnNames gathers fields from all sheets', () => {
    const columns = collectReferencedColumnNames(
      [
        sheet({ xAxisFields: [field('region')] }),
        sheet({ yAxisFields: [field('revenue')] }),
      ],
      [field('status')],
      [{ name: 'vc1', expression: '1', output_type: 'numeric' }],
    );
    expect(Array.from(columns).sort()).toEqual(['region', 'revenue', 'status', 'vc1']);
  });

  test('validateSheetSchema reports missing columns and join tables', () => {
    const result = validateSheetSchema(
      [sheet({ xAxisFields: [field('missing')] })],
      [field('present')],
      ['dim_missing'],
      ['fact', 'dim_ok'],
    );
    expect(result.allClear).toBe(false);
    expect(result.missingColumns).toEqual(['missing']);
    expect(result.missingJoinedTables).toEqual(['dim_missing']);
  });

  test('validateSheetSchema does not report virtual columns as missing', () => {
    const result = validateSheetSchema(
      [sheet({ xAxisFields: [field('vc_revenue')] })],
      [field('real_col')],
      [],
      ['fact'],
      [],
      [{ name: 'vc_revenue', expression: 'price * qty', output_type: 'numeric' }],
    );
    expect(result.allClear).toBe(true);
    expect(result.missingColumns).toEqual([]);
  });
});

describe('isSchemaCheckReady', () => {
  const ready = {
    selectedTable: 'events',
    realFieldCount: 12,
    isLoadingMetadata: false,
    hasJoinsOrUnions: false,
    hasVirtualTable: false,
  };

  test('ready once real columns are fetched', () => {
    expect(isSchemaCheckReady(ready)).toBe(true);
  });

  test('not ready before any real column arrives (virtual columns must not count)', () => {
    expect(isSchemaCheckReady({ ...ready, realFieldCount: 0 })).toBe(false);
  });

  test('not ready while metadata is still loading', () => {
    expect(isSchemaCheckReady({ ...ready, isLoadingMetadata: true })).toBe(false);
  });

  test('not ready without a table', () => {
    expect(isSchemaCheckReady({ ...ready, selectedTable: '' })).toBe(false);
  });

  test('with joins/unions, waits for the merged virtual table', () => {
    expect(isSchemaCheckReady({ ...ready, hasJoinsOrUnions: true })).toBe(false);
    expect(
      isSchemaCheckReady({ ...ready, hasJoinsOrUnions: true, hasVirtualTable: true }),
    ).toBe(true);
  });
});

describe('planDatabaseMirror', () => {
  const base = {
    targetDatabase: 'prod_eu',
    primaryDatabase: 'prod_us',
    primaryTable: 'orders',
    unionTables: [{ database: 'prod_us', table_name: 'events' }],
    targetTableNames: ['orders', 'events', 'audit_log'],
  };

  it('mirrors the primary and union table names into the target database', () => {
    const plan = planDatabaseMirror(base);

    expect(plan.toAdd).toEqual([
      { database: 'prod_eu', table_name: 'orders' },
      { database: 'prod_eu', table_name: 'events' },
    ]);
    expect(plan.missing).toEqual([]);
    expect(plan.alreadyPresent).toEqual([]);
    expect(plan.droppedOverLimit).toEqual([]);
  });

  it('preserves selection order and never mirrors a name twice', () => {
    const plan = planDatabaseMirror({
      ...base,
      unionTables: [
        { database: 'prod_us', table_name: 'events' },
        { database: 'staging', table_name: 'events' },
        { database: 'staging', table_name: 'orders' },
      ],
    });

    expect(plan.toAdd.map((t) => t.table_name)).toEqual(['orders', 'events']);
  });

  it('reports names that do not exist in the target database', () => {
    const plan = planDatabaseMirror({ ...base, targetTableNames: ['orders'] });

    expect(plan.toAdd).toEqual([{ database: 'prod_eu', table_name: 'orders' }]);
    expect(plan.missing).toEqual(['events']);
  });

  it('treats the primary own database as a complete no-op', () => {
    const plan = planDatabaseMirror({ ...base, targetDatabase: 'prod_us' });

    expect(plan.toAdd).toEqual([]);
    expect(plan.alreadyPresent.map((t) => t.table_name)).toEqual(['orders', 'events']);
  });

  it('skips refs already present in the target database', () => {
    const plan = planDatabaseMirror({
      ...base,
      unionTables: [
        { database: 'prod_us', table_name: 'events' },
        { database: 'prod_eu', table_name: 'orders' },
      ],
    });

    expect(plan.toAdd).toEqual([{ database: 'prod_eu', table_name: 'events' }]);
    expect(plan.alreadyPresent).toEqual([{ database: 'prod_eu', table_name: 'orders' }]);
  });

  it('clamps at the union limit, counting tables already selected', () => {
    const plan = planDatabaseMirror({
      ...base,
      unionTables: [
        { database: 'prod_us', table_name: 'events' },
        { database: 'prod_us', table_name: 'audit_log' },
      ],
      maxUnionTables: 3,
    });

    // 2 already selected + 1 addition hits the cap of 3.
    expect(plan.toAdd).toEqual([{ database: 'prod_eu', table_name: 'orders' }]);
    expect(plan.droppedOverLimit.map((t) => t.table_name)).toEqual(['events', 'audit_log']);
  });

  it('has nothing to mirror without a primary table', () => {
    const plan = planDatabaseMirror({ ...base, primaryTable: '', unionTables: [] });

    expect(plan).toEqual({
      toAdd: [],
      missing: [],
      alreadyPresent: [],
      droppedOverLimit: [],
    });
  });

  it('matches file-style union refs by table name alone', () => {
    const plan = planDatabaseMirror({
      ...base,
      primaryDatabase: '',
      unionTables: [{ database: '', table_name: 'events' }],
    });

    expect(plan.toAdd.map((t) => t.table_name)).toEqual(['orders', 'events']);
  });
});

describe('planDatabaseSwitch', () => {
  const base = {
    targetDatabase: 'prod_eu',
    primaryDatabase: 'prod_us',
    primaryTable: 'orders',
    joinedTables: [],
    unionTables: [],
    targetTableNames: ['orders', 'events'],
  };

  it('allows a switch when the primary table exists in the target', () => {
    expect(planDatabaseSwitch(base)).toEqual({ missingJoinedTables: [] });
  });

  it('blocks without a primary table to preserve', () => {
    expect(planDatabaseSwitch({ ...base, primaryTable: '' }).blocker).toBe('no-primary-table');
  });

  it('blocks when the target is already the primary database', () => {
    expect(planDatabaseSwitch({ ...base, targetDatabase: 'prod_us' }).blocker).toBe('same-database');
  });

  it('blocks when the primary table is absent from the target', () => {
    expect(planDatabaseSwitch({ ...base, targetTableNames: ['events'] }).blocker).toBe(
      'primary-table-missing',
    );
  });

  it('blocks while a cross-database union is active', () => {
    expect(
      planDatabaseSwitch({
        ...base,
        unionTables: [{ database: 'staging', table_name: 'orders' }],
      }).blocker,
    ).toBe('cross-database-union');
  });

  it('reports missing joined tables without blocking the switch', () => {
    const result = planDatabaseSwitch({ ...base, joinedTables: ['customers', 'events'] });

    expect(result.blocker).toBeUndefined();
    expect(result.missingJoinedTables).toEqual(['customers']);
  });
});
