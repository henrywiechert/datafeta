// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TableAddPicker from './TableAddPicker';

const renderPicker = (overrides: Partial<React.ComponentProps<typeof TableAddPicker>> = {}) => {
  const onDbSwitchEnabledChange = jest.fn();
  const result = render(
    <TableAddPicker
      databases={['analytics', 'analytics_prod']}
      tablesCache={{ analytics: [{ name: 'orders' }] }}
      primaryDatabase="analytics"
      primaryTable="orders"
      unionTables={[]}
      onAdd={jest.fn()}
      dbSwitchEnabled={false}
      onDbSwitchEnabledChange={onDbSwitchEnabledChange}
      onDatabaseSwitch={jest.fn()}
      {...overrides}
    />
  );
  return { ...result, onDbSwitchEnabledChange };
};

describe('TableAddPicker keep-tables toggle', () => {
  it('places a compact toggle on the DB row instead of a labeled checkbox', () => {
    renderPicker();

    expect(screen.queryByText('DB switch')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Keep tables when changing database' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles keep-tables mode from the DB-row icon', () => {
    const { onDbSwitchEnabledChange } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Keep tables when changing database' }));
    expect(onDbSwitchEnabledChange).toHaveBeenCalledWith(true);
  });

  it('shows a pressed state when keep-tables mode is on', () => {
    renderPicker({ dbSwitchEnabled: true });

    expect(screen.getByRole('button', { name: 'Keep tables when changing database' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
