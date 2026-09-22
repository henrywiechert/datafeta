// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SelectedTablesList from './SelectedTablesList';
import { metadataApi } from '../../../services/api/metadataApi';

// The list fetches a row count and a column count per selected table. Those are
// irrelevant here and would otherwise hit the network on every render.
jest.mock('../../../services/api/metadataApi', () => ({
  metadataApi: { getRowCount: jest.fn(), listColumns: jest.fn() },
}));

// react-scripts enables `resetMocks`, which drops any implementation set in the
// factory above — so the stubs have to be (re)installed per test.
beforeEach(() => {
  (metadataApi.getRowCount as jest.Mock).mockResolvedValue(0);
  (metadataApi.listColumns as jest.Mock).mockResolvedValue({ columns: [] });
});

/** Let the per-row count fetches settle so they cannot update after a test. */
const flushStats = () =>
  waitFor(() => expect(metadataApi.getRowCount).toHaveBeenCalled());

const renderList = (
  overrides: Partial<React.ComponentProps<typeof SelectedTablesList>> = {}
) => {
  const onRemoveDatabase = jest.fn();
  const onRemoveUnionTable = jest.fn();
  const onRemovePrimary = jest.fn();
  render(
    <SelectedTablesList
      primaryDatabase="prod_us"
      primaryTable="orders"
      unionTables={[
        { database: 'prod_us', table_name: 'events' },
        { database: 'prod_eu', table_name: 'orders' },
        { database: 'prod_eu', table_name: 'events' },
      ]}
      onRemovePrimary={onRemovePrimary}
      onRemoveUnionTable={onRemoveUnionTable}
      onRemoveDatabase={onRemoveDatabase}
      {...overrides}
    />
  );
  return { onRemoveDatabase, onRemoveUnionTable, onRemovePrimary };
};

describe('SelectedTablesList — remove a whole database', () => {
  it('offers the control on every row of a removable database', async () => {
    renderList();
    await flushStats();

    expect(screen.getAllByRole('button', { name: 'Remove all tables from prod_eu' })).toHaveLength(
      2
    );
  });

  it('keeps the per-table remove alongside it', async () => {
    renderList();
    await flushStats();

    // Labels are database-qualified: mirroring repeats table names across rows.
    expect(screen.getByRole('button', { name: 'Remove prod_eu.orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove prod_eu.events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove prod_us.events' })).toBeInTheDocument();
  });

  // Removing every table of the primary's database would clear the primary,
  // which resets joins, unions and relationships with it.
  it('never offers it for the primary own database', async () => {
    renderList({
      unionTables: [
        { database: 'prod_us', table_name: 'events' },
        { database: 'prod_us', table_name: 'audit_log' },
      ],
    });
    await flushStats();

    expect(
      screen.queryByRole('button', { name: 'Remove all tables from prod_us' })
    ).not.toBeInTheDocument();
  });

  it('does not offer it for a database contributing a single table', async () => {
    renderList({ unionTables: [{ database: 'prod_eu', table_name: 'orders' }] });
    await flushStats();

    expect(
      screen.queryByRole('button', { name: 'Remove all tables from prod_eu' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove prod_eu.orders' })).toBeInTheDocument();
  });

  it('is hidden entirely when no handler is wired', async () => {
    renderList({ onRemoveDatabase: undefined });
    await flushStats();

    expect(
      screen.queryByRole('button', { name: 'Remove all tables from prod_eu' })
    ).not.toBeInTheDocument();
  });

  it('asks before removing, and removes nothing on cancel', async () => {
    const { onRemoveDatabase } = renderList();
    await flushStats();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove all tables from prod_eu' })[0]
    );

    expect(
      screen.getByRole('dialog', { name: /Remove 2 tables from prod_eu\?/ })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onRemoveDatabase).not.toHaveBeenCalled();
  });

  it('removes exactly that database refs on confirm', async () => {
    const { onRemoveDatabase, onRemoveUnionTable } = renderList();
    await flushStats();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove all tables from prod_eu' })[0]
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemoveDatabase).toHaveBeenCalledTimes(1);
    expect(onRemoveDatabase).toHaveBeenCalledWith('prod_eu', [
      { database: 'prod_eu', table_name: 'orders' },
      { database: 'prod_eu', table_name: 'events' },
    ]);
    // The primary's database is untouched, and no per-table path was used.
    expect(onRemoveUnionTable).not.toHaveBeenCalled();
  });

  it('names the tables in the confirmation', async () => {
    renderList();
    await flushStats();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove all tables from prod_eu' })[0]
    );

    expect(screen.getByText('orders, events')).toBeInTheDocument();
  });
});
