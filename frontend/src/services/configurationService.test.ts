// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  exportConfiguration,
  reconstructConnectionDetails,
  sanitizeConnectionDetails,
} from './configurationService';
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

describe('file_parts in saved connection metadata', () => {
  it('round-trips the part (e.g. sheet) selection for file connections', () => {
    const fileParts = { 'shop.xlsx': ['Orders', 'Customers'] };

    const saved = sanitizeConnectionDetails({ type: 'csv', file_parts: fileParts });

    expect(saved?.file_parts).toEqual(fileParts);
    expect(reconstructConnectionDetails(saved!).file_parts).toEqual(fileParts);
  });

  it('omits an empty selection', () => {
    expect(sanitizeConnectionDetails({ type: 'csv', file_parts: {} })).toEqual({ type: 'csv' });
  });
});

describe('InfluxDB connection metadata', () => {
  const details = {
    type: 'influxdb' as const,
    influx_url: 'http://influx:8086',
    influx_auth: 'basic' as const,
    influx_username: 'reader',
    influx_password: 'secret',
    influx_verify_ssl: true,
    influx_database: 'telegraf',
    influx_measurements: ['cpu', 'mem'],
    influx_time_mode: 'last' as const,
    influx_last: '7d',
  };

  test('saves everything except the password and token', () => {
    const saved = sanitizeConnectionDetails({ ...details, influx_token: 'tok' })!;
    expect(saved).toEqual({
      type: 'influxdb',
      influx_url: 'http://influx:8086',
      influx_auth: 'basic',
      influx_username: 'reader',
      influx_verify_ssl: true,
      influx_database: 'telegraf',
      influx_measurements: ['cpu', 'mem'],
      influx_time_mode: 'last',
      influx_last: '7d',
    });
  });

  test('the restore secret becomes the password or the token by auth mode', () => {
    const saved = sanitizeConnectionDetails(details)!;
    expect(reconstructConnectionDetails(saved, 'pw')).toMatchObject({
      influx_password: 'pw',
      influx_database: 'telegraf',
    });
    expect(reconstructConnectionDetails(saved, 'pw')).not.toHaveProperty('influx_token');

    const tokenSaved = { ...saved, influx_auth: 'token' as const, influx_username: undefined };
    const restored = reconstructConnectionDetails(tokenSaved, 'tok');
    expect(restored.influx_token).toBe('tok');
    expect(restored).not.toHaveProperty('influx_password');
  });
});
