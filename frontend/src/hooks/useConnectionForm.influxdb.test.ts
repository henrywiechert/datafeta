// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useConnectionForm } from './useConnectionForm';

jest.mock('../apiService', () => ({ apiService: {} }));

function influxForm() {
  const hook = renderHook(() => useConnectionForm());
  act(() => hook.result.current.setConnectionType('influxdb'));
  return hook;
}

describe('useConnectionForm InfluxDB state', () => {
  it('needs a database before connecting', () => {
    const { result } = influxForm();
    expect(result.current.validateForm()).toEqual({
      isValid: false,
      errorMessage: 'Enter or pick an InfluxDB database',
    });
  });

  it('builds token-auth details with the last-N window and no password', () => {
    const { result } = influxForm();
    act(() => result.current.updateInfluxDbState({
      url: ' https://influx.example:8086 ',
      auth: 'token',
      token: 'tok',
      password: 'stale',
      database: 'telegraf',
      last: '24h',
    }));

    expect(result.current.validateForm().isValid).toBe(true);
    expect(result.current.buildConnectionDetails()).toEqual({
      type: 'influxdb',
      influx_url: 'https://influx.example:8086',
      influx_auth: 'token',
      influx_token: 'tok',
      influx_verify_ssl: true,
      influx_database: 'telegraf',
      influx_time_mode: 'last',
      influx_last: '24h',
    });
  });

  it('sends the selected measurements and a between window', () => {
    const { result } = influxForm();
    act(() => result.current.updateInfluxDbState({
      auth: 'basic',
      username: 'reader',
      password: 'pw',
      database: 'telegraf',
      measurements: [
        { name: 'cpu', table_name: 'cpu', tag_count: 2, field_count: 3 },
        { name: 'disk.io', table_name: 'disk_io', tag_count: 1, field_count: 2 },
      ],
      selectedMeasurements: ['disk.io'],
      timeMode: 'between',
      start: '2026-01-01T00:00',
      end: '2026-01-02T00:00',
    }));

    expect(result.current.buildConnectionDetails()).toMatchObject({
      influx_auth: 'basic',
      influx_username: 'reader',
      influx_password: 'pw',
      influx_measurements: ['disk.io'],
      influx_time_mode: 'between',
      influx_start: '2026-01-01T00:00',
      influx_end: '2026-01-02T00:00',
    });
    expect(result.current.buildConnectionDetails()).not.toHaveProperty('influx_last');
  });

  it.each([
    [{ url: 'localhost:8086' }, 'Enter the InfluxDB URL, e.g. http://localhost:8086'],
    [{ auth: 'basic' as const }, 'Enter the InfluxDB username'],
    [{ auth: 'token' as const }, 'Enter an InfluxDB API token'],
    [{ last: '7 days' }, 'Enter a duration like 30m, 12h, 7d or 4w'],
    [{ timeMode: 'between' as const }, 'Enter the start of the time range'],
    [
      { timeMode: 'between' as const, start: '2026-01-02T00:00', end: '2026-01-01T00:00' },
      'The end of the time range must be after its start',
    ],
    [
      {
        measurements: [{ name: 'cpu', table_name: 'cpu', tag_count: 0, field_count: 1 }],
        selectedMeasurements: [],
      },
      'Select at least one measurement',
    ],
  ])('rejects %p', (updates, message) => {
    const { result } = influxForm();
    act(() => result.current.updateInfluxDbState({ database: 'telegraf', ...updates }));
    expect(result.current.validateForm()).toEqual({ isValid: false, errorMessage: message });
  });

  it('restores the form from the active connection', () => {
    const { result } = renderHook(() => useConnectionForm());
    act(() => result.current.syncFromConnectionDetails({
      type: 'influxdb',
      influx_url: 'http://influx:8086',
      influx_auth: 'basic',
      influx_username: 'reader',
      influx_database: 'telegraf',
      influx_measurements: ['cpu'],
      influx_time_mode: 'all',
    }));

    expect(result.current.connectionType).toBe('influxdb');
    expect(result.current.influxDbState).toMatchObject({
      url: 'http://influx:8086',
      auth: 'basic',
      username: 'reader',
      database: 'telegraf',
      selectedMeasurements: ['cpu'],
      timeMode: 'all',
      last: '7d',
    });
    // A reconnect from the restored form keeps the measurement selection.
    expect(result.current.buildConnectionDetails().influx_measurements).toEqual(['cpu']);
  });
});
