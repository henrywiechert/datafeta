// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DateTimeRangeFilter from './DateTimeRangeFilter';
import { DateTimeFilterMetadata } from '../../types';

const metadata: DateTimeFilterMetadata = {
  fieldId: 'ts',
  columnName: 'ts',
  type: 'datetime',
  loading: false,
  min: '2026-01-01T00:00:00.000Z',
  max: '2026-12-31T23:59:59.999Z',
};

/** Last reported preset from the most recent onChange call. */
const lastPreset = (onChange: jest.Mock): string | undefined =>
  onChange.mock.calls[onChange.mock.calls.length - 1][2];

describe('DateTimeRangeFilter preset reporting', () => {
  test('reports the preset label alongside the resolved range', () => {
    const onChange = jest.fn();
    render(
      <DateTimeRangeFilter
        metadata={metadata}
        startDateTime="2026-03-01T00:00:00.000Z"
        endDateTime="2026-03-08T00:00:00.000Z"
        onChange={onChange}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Last 7 Days' }));

    expect(lastPreset(onChange)).toBe('Last 7 Days');
    const [start, end] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(start).not.toBe('2026-03-01T00:00:00.000Z');
    expect(end).not.toBe('2026-03-08T00:00:00.000Z');
  });

  test('shows the persisted preset and drops it when a date is edited by hand', () => {
    const onChange = jest.fn();
    render(
      <DateTimeRangeFilter
        metadata={metadata}
        startDateTime="2026-03-01T00:00:00.000Z"
        endDateTime="2026-03-08T00:00:00.000Z"
        preset="Last 7 Days"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Last 7 Days');
    expect(lastPreset(onChange)).toBe('Last 7 Days');

    // TextField puts the aria-label on its root, so reach for the inner input.
    const startDateInput = screen.getByLabelText('Start date').querySelector('input')!;
    fireEvent.change(startDateInput, { target: { value: '2026-02-01' } });

    expect(lastPreset(onChange)).toBeUndefined();
  });
});
