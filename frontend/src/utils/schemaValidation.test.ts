// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  collectReferencedColumnNames,
  hasCrossDatabaseUnion,
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
});
