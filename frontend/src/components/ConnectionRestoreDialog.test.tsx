// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectionRestoreDialog from './ConnectionRestoreDialog';
import { apiService } from '../apiService';
import { SavedConnectionMetadata } from '../types';

jest.mock('../apiService', () => ({
  apiService: {
    listInfluxDbDatabases: jest.fn(),
    listInfluxDbMeasurements: jest.fn(),
  },
}));

const api = apiService as jest.Mocked<typeof apiService>;

const influxMetadata: SavedConnectionMetadata = {
  type: 'influxdb',
  influx_url: 'http://influx:8086',
  influx_auth: 'basic',
  influx_username: 'reader',
  influx_verify_ssl: true,
  influx_database: 'telegraf',
  influx_measurements: ['cpu', 'mem'],
  influx_time_mode: 'last',
  influx_last: '7d',
};

const measurement = (name: string) => ({ name, table_name: name, tag_count: 1, field_count: 2 });

function setup(metadata: SavedConnectionMetadata = influxMetadata) {
  const onConnect = jest.fn().mockResolvedValue(undefined);
  render(
    <ConnectionRestoreDialog
      open
      connectionMetadata={metadata}
      onConnect={onConnect}
      onCancel={jest.fn()}
      onSkip={jest.fn()}
    />,
  );
  const restoreOptions = () => onConnect.mock.calls[0][7];
  return { onConnect, restoreOptions };
}

const databaseField = () => screen.getByRole('combobox', { name: 'Database' }) as HTMLInputElement;

describe('ConnectionRestoreDialog — InfluxDB', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts from the saved database and measurements', async () => {
    const { restoreOptions } = setup();

    expect(databaseField().value).toBe('telegraf');
    expect(screen.getByText('Loads: cpu, mem')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(restoreOptions().influxDb).toMatchObject({ database: 'telegraf', measurements: ['cpu', 'mem'] });
    expect(restoreOptions().influxDb.timeRange).toMatchObject({ mode: 'last', last: '7d' });
  });

  it('lists databases with the entered credentials and connects to the chosen one', async () => {
    api.listInfluxDbDatabases.mockResolvedValue({ server_version: '1.8', databases: ['telegraf', 'staging'] });
    const { restoreOptions } = setup();

    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'List databases' }));

    expect(api.listInfluxDbDatabases).toHaveBeenCalledWith(expect.objectContaining({
      influx_url: 'http://influx:8086',
      influx_auth: 'basic',
      influx_username: 'reader',
      influx_password: 'pw',
    }));

    await userEvent.click(databaseField());
    await userEvent.click(await screen.findByRole('option', { name: 'staging' }));
    expect(databaseField().value).toBe('staging');

    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(restoreOptions().influxDb.database).toBe('staging');
  });

  it('loads measurements, keeps the saved choice, and connects with the edited selection', async () => {
    api.listInfluxDbMeasurements.mockResolvedValue({
      measurements: [measurement('cpu'), measurement('disk'), measurement('mem')],
    });
    const { restoreOptions } = setup();

    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Load measurements' }));

    const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}\\b`) });
    await waitFor(() => expect(box('disk')).toBeInTheDocument());
    expect(api.listInfluxDbMeasurements).toHaveBeenCalledWith(expect.anything(), 'telegraf');
    expect(box('cpu')).toBeChecked();
    expect(box('mem')).toBeChecked();
    expect(box('disk')).not.toBeChecked();

    await userEvent.click(box('mem'));
    await userEvent.click(box('disk'));
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(restoreOptions().influxDb).toMatchObject({ database: 'telegraf', measurements: ['cpu', 'disk'] });
  });

  it('selects every measurement when the snapshot loaded all of them', async () => {
    api.listInfluxDbMeasurements.mockResolvedValue({ measurements: [measurement('cpu'), measurement('mem')] });
    setup({ ...influxMetadata, influx_measurements: undefined });

    expect(screen.getByText('Loads every measurement in the database.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Load measurements' }));

    expect(await screen.findByRole('checkbox', { name: 'Select all' })).toBeChecked();
  });

  it('refuses to connect with no measurement selected', async () => {
    api.listInfluxDbMeasurements.mockResolvedValue({ measurements: [measurement('cpu')] });
    const { onConnect } = setup();

    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Load measurements' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByText('Select at least one measurement')).toBeInTheDocument();
  });

  it('needs the token before discovering on token auth', () => {
    setup({ ...influxMetadata, influx_auth: 'token', influx_username: undefined });

    expect(screen.getByRole('button', { name: 'List databases' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load measurements' })).toBeDisabled();
  });

  describe('time range', () => {
    const timeRangeSelect = () => screen.getByRole('combobox', { name: 'Time range' });
    const pickMode = async (label: string) => {
      await userEvent.click(timeRangeSelect());
      await userEvent.click(await screen.findByRole('option', { name: label }));
    };

    it('changes the duration', async () => {
      const { restoreOptions } = setup();

      const duration = screen.getByRole('combobox', { name: 'Duration' });
      expect(duration).toHaveValue('7d');
      await userEvent.clear(duration);
      await userEvent.type(duration, '30d');
      await userEvent.type(screen.getByLabelText('Password'), 'pw');
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

      expect(restoreOptions().influxDb.timeRange).toMatchObject({ mode: 'last', last: '30d' });
    });

    it('switches to a fixed window and validates it', async () => {
      const { onConnect, restoreOptions } = setup();

      await pickMode('Between (UTC)');
      await userEvent.type(screen.getByLabelText('Password'), 'pw');
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      expect(onConnect).not.toHaveBeenCalled();
      expect(screen.getByText('Enter the start of the time range')).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText('Start (UTC)'), '2026-01-01T00:00');
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

      expect(restoreOptions().influxDb.timeRange).toMatchObject({
        mode: 'between',
        start: '2026-01-01T00:00',
        end: '',
      });
    });

    it('rejects an invalid duration', async () => {
      const { onConnect } = setup();

      const duration = screen.getByRole('combobox', { name: 'Duration' });
      await userEvent.clear(duration);
      await userEvent.type(duration, 'soon');
      await userEvent.type(screen.getByLabelText('Password'), 'pw');
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

      expect(onConnect).not.toHaveBeenCalled();
      expect(screen.getByText('Enter a duration like 30m, 12h, 7d or 4w')).toBeInTheDocument();
    });

    it('treats a snapshot without a stored mode as all time, like the server', () => {
      setup({ ...influxMetadata, influx_time_mode: undefined, influx_last: undefined });

      expect(timeRangeSelect()).toHaveTextContent('All time');
    });
  });
});
