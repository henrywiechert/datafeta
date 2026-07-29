// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { exportConfiguration } from './configurationService';
import { Sheet } from '../types/sheet';
import { VirtualColumnDefinition } from '../types/virtualColumn';

// exportConfiguration only reads `sheet.visualizationState.globalChartType`, so
// a minimal stub is sufficient for these serialization tests.
const makeSheet = (): Sheet =>
  ({
    id: 'sheet-1',
    name: 'Sheet 1',
    visualizationState: { globalChartType: null },
  } as unknown as Sheet);

describe('exportConfiguration virtual columns', () => {
  const virtualColumns: VirtualColumnDefinition[] = [
    { name: 'vc1', expression: '1 + 1', output_type: 'numeric' },
  ];

  test('persists virtual columns even when no database/table is selected (empty sheet)', () => {
    const config = exportConfiguration(
      [makeSheet()],
      'sheet-1',
      2,
      null, // no connection
      '', // selectedDatabase
      '', // selectedTable
      undefined, // unionTables
      undefined, // joinedTables
      virtualColumns,
    );

    expect(config.dataSource).toBeDefined();
    expect(config.dataSource?.virtualColumns).toEqual(virtualColumns);
  });

  test('does not create a dataSource block when there is genuinely nothing to persist', () => {
    const config = exportConfiguration([makeSheet()], 'sheet-1', 2, null, '', '');

    expect(config.dataSource).toBeUndefined();
  });

  test('still persists virtual columns alongside a selected table', () => {
    const config = exportConfiguration(
      [makeSheet()],
      'sheet-1',
      2,
      null,
      'db',
      'tbl',
      undefined,
      undefined,
      virtualColumns,
    );

    expect(config.dataSource?.selectedTable).toBe('tbl');
    expect(config.dataSource?.virtualColumns).toEqual(virtualColumns);
  });
});
