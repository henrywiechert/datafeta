// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { refreshRelativeDateTimeFilters } from './relativeDateTimeFilters';
import { validateConfiguration } from './configurationService';
import { DateTimeFilterConfig, FilterConfig } from '../types';

const datetimeFilter = (overrides: Partial<DateTimeFilterConfig> = {}): DateTimeFilterConfig => ({
  fieldId: 'field-1',
  columnName: 'ts',
  type: 'datetime',
  // Resolved when the snapshot was saved, long before `now` below.
  startDate: '2026-01-01 00:00:00.000',
  endDate: '2026-01-08 00:00:00.000',
  ...overrides,
});

const makeConfig = (configurations: Record<string, FilterConfig>) => ({
  appName: 'data-slicer',
  version: '1.0.0',
  sheets: [
    {
      id: 'sheet-1',
      name: 'Sheet 1',
      visualizationState: {
        filterConfigurations: configurations,
        appliedFilterConfigurations: JSON.parse(JSON.stringify(configurations)),
      },
    },
  ],
  nextSheetNumber: 2,
});

// A fixed "now" so the expected window is deterministic.
const NOW = new Date('2026-09-07T12:00:00.000Z');

describe('refreshRelativeDateTimeFilters', () => {
  test('recalculates a relative preset against the current time', () => {
    const config = makeConfig({ 'field-1': datetimeFilter({ preset: 'Last 7 Days' }) });

    const refreshed = refreshRelativeDateTimeFilters(config, NOW);

    expect(refreshed).toBe(2); // filterConfigurations + appliedFilterConfigurations
    const cfg = config.sheets[0].visualizationState.filterConfigurations['field-1'] as DateTimeFilterConfig;
    expect(cfg.endDate?.startsWith('2026-09-07')).toBe(true);
    expect(cfg.startDate?.startsWith('2026-08-31')).toBe(true);
    // The label survives, so the next save stays relative too.
    expect(cfg.preset).toBe('Last 7 Days');
  });

  test('keeps applied and pending filter maps in sync', () => {
    const config = makeConfig({ 'field-1': datetimeFilter({ preset: 'Last 7 Days' }) });

    refreshRelativeDateTimeFilters(config, NOW);

    const { filterConfigurations, appliedFilterConfigurations } = config.sheets[0].visualizationState;
    expect(appliedFilterConfigurations['field-1']).toEqual(filterConfigurations['field-1']);
  });

  test('leaves a hand-picked range untouched', () => {
    const config = makeConfig({ 'field-1': datetimeFilter() });

    expect(refreshRelativeDateTimeFilters(config, NOW)).toBe(0);
    const cfg = config.sheets[0].visualizationState.filterConfigurations['field-1'] as DateTimeFilterConfig;
    expect(cfg.startDate).toBe('2026-01-01 00:00:00.000');
    expect(cfg.endDate).toBe('2026-01-08 00:00:00.000');
  });

  test("leaves the data-bounded 'All Time' preset untouched", () => {
    const config = makeConfig({ 'field-1': datetimeFilter({ preset: 'All Time' }) });

    expect(refreshRelativeDateTimeFilters(config, NOW)).toBe(0);
    const cfg = config.sheets[0].visualizationState.filterConfigurations['field-1'] as DateTimeFilterConfig;
    expect(cfg.startDate).toBe('2026-01-01 00:00:00.000');
  });

  test('ignores a preset label that is not offered for the field’s datetime part', () => {
    // 'Last Hour' is a full-datetime preset; a month-timeline field has its own list.
    const config = makeConfig({
      'field-1': datetimeFilter({ preset: 'Last Hour', dateTimePart: 'month' }),
    });

    expect(refreshRelativeDateTimeFilters(config, NOW)).toBe(0);
  });

  test('resolves a part-specific preset from that part’s list', () => {
    const config = makeConfig({
      'field-1': datetimeFilter({ preset: 'Last 3 Months', dateTimePart: 'month' }),
    });

    expect(refreshRelativeDateTimeFilters(config, NOW)).toBe(2);
    const cfg = config.sheets[0].visualizationState.filterConfigurations['field-1'] as DateTimeFilterConfig;
    expect(cfg.startDate?.startsWith('2026-06-07')).toBe(true);
  });

  test('refreshes session (global) filters as well', () => {
    const config = {
      ...makeConfig({}),
      sessionFilters: {
        fields: [],
        configurations: { 'field-1': datetimeFilter({ preset: 'Last 7 Days' }) },
      },
    };

    expect(refreshRelativeDateTimeFilters(config, NOW)).toBe(1);
    const cfg = config.sessionFilters.configurations['field-1'] as DateTimeFilterConfig;
    expect(cfg.startDate?.startsWith('2026-08-31')).toBe(true);
  });

  test('ignores non-datetime filters', () => {
    const config = makeConfig({
      'field-2': { fieldId: 'field-2', columnName: 'x', type: 'continuous', min: 0, max: 1 },
    });

    expect(refreshRelativeDateTimeFilters(config, NOW)).toBe(0);
  });
});

describe('validateConfiguration', () => {
  test('refreshes relative datetime filters on load', () => {
    const config = validateConfiguration(
      makeConfig({ 'field-1': datetimeFilter({ preset: 'Last 7 Days' }) }),
    );

    const cfg = config.sheets[0].visualizationState.filterConfigurations['field-1'] as DateTimeFilterConfig;
    // Resolved against the real clock here, so just assert it moved off the
    // stored window.
    expect(cfg.startDate).not.toBe('2026-01-01 00:00:00.000');
    expect(cfg.preset).toBe('Last 7 Days');
  });
});
