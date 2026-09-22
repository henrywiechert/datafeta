// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TableAddPicker from './TableAddPicker';

const SWITCH_LABEL = 'Switch to this database, keeping current tables';
const ADD_DB_LABEL = 'Add matching tables from database';

const renderPicker = (overrides: Partial<React.ComponentProps<typeof TableAddPicker>> = {}) => {
  const onAdd = jest.fn();
  const onDatabaseSwitch = jest.fn();
  const onAddDatabase = jest.fn();
  const onLoadTablesForDatabase = jest.fn();
  const result = render(
    <TableAddPicker
      databases={['prod_us', 'prod_eu']}
      tablesCache={{
        prod_us: [{ name: 'orders' }, { name: 'events' }],
        prod_eu: [{ name: 'orders' }, { name: 'events' }],
      }}
      primaryDatabase="prod_us"
      primaryTable="orders"
      unionTables={[]}
      onAdd={onAdd}
      onDatabaseSwitch={onDatabaseSwitch}
      onAddDatabase={onAddDatabase}
      onLoadTablesForDatabase={onLoadTablesForDatabase}
      {...overrides}
    />
  );
  return { ...result, onAdd, onDatabaseSwitch, onAddDatabase, onLoadTablesForDatabase };
};

/** Stage a database through the DB dropdown, the way a user would. */
const stageDatabase = (name: string) => {
  const input = screen.getByPlaceholderText('Database');
  fireEvent.mouseDown(input);
  fireEvent.click(screen.getByRole('option', { name }));
};

const button = (name: string) => screen.getByRole('button', { name });

/**
 * The tooltip text for one action. MUI puts the tooltip title on the wrapping
 * span's aria-label, and both DB-row actions can show the same reason at once,
 * so this reads the specific button's own wrapper rather than searching.
 */
const tooltipFor = (name: string) => button(name).closest('span')?.getAttribute('aria-label');

describe('TableAddPicker — the DB dropdown only stages', () => {
  // The regression this whole design change is about: selecting a database used
  // to perform a keep-tables switch immediately while the mode toggle was on.
  it('does not switch databases when one is selected', () => {
    const { onDatabaseSwitch } = renderPicker();

    stageDatabase('prod_eu');

    expect(onDatabaseSwitch).not.toHaveBeenCalled();
  });

  it('loads the staged database table list so the actions can resolve', () => {
    const { onLoadTablesForDatabase } = renderPicker();

    stageDatabase('prod_eu');

    expect(onLoadTablesForDatabase).toHaveBeenCalledWith('prod_eu');
  });

  it('has no keep-tables mode toggle', () => {
    renderPicker();

    expect(
      screen.queryByRole('button', { name: 'Keep tables when changing database' })
    ).not.toBeInTheDocument();
    expect(button(SWITCH_LABEL)).not.toHaveAttribute('aria-pressed');
  });
});

describe('TableAddPicker — switch action', () => {
  it('switches to the staged database on click', () => {
    const { onDatabaseSwitch } = renderPicker();

    stageDatabase('prod_eu');
    fireEvent.click(button(SWITCH_LABEL));

    expect(onDatabaseSwitch).toHaveBeenCalledWith('prod_eu');
  });

  it('is blocked without a primary table to preserve', () => {
    renderPicker({ primaryTable: '' });

    stageDatabase('prod_eu');

    expect(button(SWITCH_LABEL)).toBeDisabled();
    expect(tooltipFor(SWITCH_LABEL)).toBe('Select a table first');
  });

  it('is blocked when the staged database is already the primary', () => {
    renderPicker();

    expect(button(SWITCH_LABEL)).toBeDisabled();
    expect(tooltipFor(SWITCH_LABEL)).toBe('Already using this database');
  });

  it('is blocked when the primary table is absent from the staged database', () => {
    renderPicker({ tablesCache: { prod_us: [{ name: 'orders' }], prod_eu: [{ name: 'events' }] } });

    stageDatabase('prod_eu');

    expect(button(SWITCH_LABEL)).toBeDisabled();
    expect(tooltipFor(SWITCH_LABEL)).toBe('"orders" is not in prod_eu');
  });

  it('is blocked while a cross-database union is active', () => {
    renderPicker({ unionTables: [{ database: 'staging', table_name: 'orders' }] });

    stageDatabase('prod_eu');

    expect(button(SWITCH_LABEL)).toBeDisabled();
    expect(tooltipFor(SWITCH_LABEL)).toBe('Not supported for cross-database unions');
  });

  it('is blocked while the staged table list is still loading', () => {
    renderPicker({ tablesCache: { prod_us: [{ name: 'orders' }] } });

    stageDatabase('prod_eu');

    expect(button(SWITCH_LABEL)).toBeDisabled();
    expect(tooltipFor(SWITCH_LABEL)).toBe('Loading tables…');
  });
});

describe('TableAddPicker — add-database action', () => {
  it('hands up the staged database and a plan mirroring the selection', () => {
    const { onAddDatabase } = renderPicker({
      unionTables: [{ database: 'prod_us', table_name: 'events' }],
    });

    stageDatabase('prod_eu');
    fireEvent.click(button(ADD_DB_LABEL));

    expect(onAddDatabase).toHaveBeenCalledTimes(1);
    const [database, plan] = onAddDatabase.mock.calls[0];
    expect(database).toBe('prod_eu');
    expect(plan.toAdd).toEqual([
      { database: 'prod_eu', table_name: 'orders' },
      { database: 'prod_eu', table_name: 'events' },
    ]);
  });

  it('states the resolved count before the click', () => {
    renderPicker();

    stageDatabase('prod_eu');

    expect(button(ADD_DB_LABEL)).toBeEnabled();
    expect(tooltipFor(ADD_DB_LABEL)).toBe('Add 1 table from prod_eu');
  });

  it('reports tables the staged database does not have', () => {
    renderPicker({
      unionTables: [{ database: 'prod_us', table_name: 'events' }],
      tablesCache: {
        prod_us: [{ name: 'orders' }, { name: 'events' }],
        prod_eu: [{ name: 'orders' }],
      },
    });

    stageDatabase('prod_eu');

    expect(tooltipFor(ADD_DB_LABEL)).toBe('Add 1 table from prod_eu · 1 not in prod_eu (events)');
  });

  it('is blocked without a primary table to mirror', () => {
    renderPicker({ primaryTable: '' });

    stageDatabase('prod_eu');

    expect(button(ADD_DB_LABEL)).toBeDisabled();
  });

  it('is blocked while the staged table list is still loading', () => {
    renderPicker({ tablesCache: { prod_us: [{ name: 'orders' }] } });

    stageDatabase('prod_eu');

    expect(button(ADD_DB_LABEL)).toBeDisabled();
  });

  it('is blocked when the staged database would add nothing', () => {
    renderPicker();

    // Staged DB is the primary's own: every candidate is already selected.
    expect(button(ADD_DB_LABEL)).toBeDisabled();
    expect(tooltipFor(ADD_DB_LABEL)).toBe('prod_us adds nothing — already selected');
  });

  it('is blocked when the staged database has none of the selected tables', () => {
    renderPicker({ tablesCache: { prod_us: [{ name: 'orders' }], prod_eu: [{ name: 'other' }] } });

    stageDatabase('prod_eu');

    expect(button(ADD_DB_LABEL)).toBeDisabled();
    expect(tooltipFor(ADD_DB_LABEL)).toBe('prod_eu has none of the selected tables');
  });
});

describe('TableAddPicker — table row', () => {
  it('stays usable regardless of the switch action state', () => {
    const { onAdd } = renderPicker();

    // Primary DB staged, so the switch action is blocked.
    expect(button(SWITCH_LABEL)).toBeDisabled();

    const tableInput = screen.getByPlaceholderText('Search table');
    fireEvent.mouseDown(tableInput);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('events'));
    fireEvent.click(button('Add table'));

    expect(onAdd).toHaveBeenCalledWith({ database: 'prod_us', table: 'events' });
  });
});
