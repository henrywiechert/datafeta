// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompactMetadataSelector from './CompactMetadataSelector';
import { DataSourceProvider } from '../../../contexts/DataSourceContext';

/*
 * These cases used to live in FieldsPanel.test.tsx, which reached the Data
 * Source header through FieldsPanel. The selector is its own card in the
 * Fields well now, so they render it directly.
 */

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (global as any).ResizeObserver = ResizeObserverMock;
});

beforeEach(() => {
  window.localStorage.clear();
});

const renderSelector = (
  overrides: Partial<React.ComponentProps<typeof CompactMetadataSelector>> = {}
) =>
  render(
    <CompactMetadataSelector
      connectionType="csv"
      selectedDatabase=""
      selectedTable="sample.csv"
      databases={[]}
      tables={[{ name: 'sample.csv' }]}
      isLoadingMetadata={false}
      metadataError={null}
      onDatabaseSelect={jest.fn()}
      onTableSelect={jest.fn()}
      {...overrides}
    />
  );

describe('CompactMetadataSelector', () => {
  it('collapses Data Source and shows the selected table hint', async () => {
    renderSelector();

    expect(screen.getByPlaceholderText('Search Table')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Collapse data source'));

    expect(screen.getByLabelText('Expand data source')).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search Table')).not.toBeVisible();
    });
    expect(screen.getByText('sample.csv', { selector: 'span' })).toBeInTheDocument();
    expect(window.localStorage.getItem('fieldsPanel.dataSource.expanded')).toBe('false');
  });

  it('restores collapsed Data Source state from localStorage', () => {
    window.localStorage.setItem('fieldsPanel.dataSource.expanded', 'false');
    renderSelector();

    expect(screen.getByLabelText('Expand data source')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search Table')).not.toBeVisible();
  });

  it('does not collapse Data Source when refresh is clicked', () => {
    const onRefreshMetadata = jest.fn();
    renderSelector({ onRefreshMetadata });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh metadata' }));

    expect(onRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Collapse data source')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByPlaceholderText('Search Table')).toBeVisible();
  });

  it('opens the ClickHouse pattern picker from the header without collapsing Data Source', () => {
    renderSelector({
      connectionType: 'clickhouse',
      selectedDatabase: 'analytics',
      selectedTable: 'orders',
      databases: [{ name: 'analytics' }],
      tables: [{ name: 'orders' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add tables by pattern' }));

    expect(screen.getByRole('dialog', { name: 'Add Tables By Pattern' })).toBeInTheDocument();
    expect(screen.getByLabelText('Collapse data source')).toHaveAttribute('aria-expanded', 'true');
  });

  it('portals the Kaggle table list so Fields cannot cover it', () => {
    renderSelector({
      connectionType: 'kaggle',
      selectedTable: 'train.csv',
      tables: [{ name: 'train.csv' }, { name: 'test.csv' }, { name: 'sample_submission.csv' }],
    });

    fireEvent.mouseDown(screen.getByPlaceholderText('Search Table'));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeVisible();
    expect(screen.getByRole('option', { name: 'test.csv' })).toBeInTheDocument();
    expect(listbox.closest('#data-source-content')).toBeNull();
  });

  const renderJoinSelector = (
    overrides: Partial<React.ComponentProps<typeof CompactMetadataSelector>> = {}
  ) =>
    render(
      <DataSourceProvider>
        <CompactMetadataSelector
          connectionType="clickhouse"
          selectedDatabase="analytics"
          selectedTable="orders"
          databases={[{ name: 'analytics' }]}
          tables={[{ name: 'orders' }, { name: 'customers' }]}
          isLoadingMetadata={false}
          metadataError={null}
          onDatabaseSelect={jest.fn()}
          onTableSelect={jest.fn()}
          onToggleJoinedTable={jest.fn()}
          {...overrides}
        />
      </DataSourceProvider>
    );

  it('hides Related Tables when there are no joinable or joined tables', () => {
    renderJoinSelector({
      suggestedJoinableTables: [],
      joinedTables: [],
    });

    expect(screen.queryByText('Related Tables')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage relationships' })).toBeInTheDocument();
  });

  it('opens the relationship editor from the Data Source header when Related Tables is hidden', () => {
    renderJoinSelector({
      suggestedJoinableTables: [],
      joinedTables: [],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Manage relationships' }));

    expect(screen.getByRole('dialog', { name: 'Manage Table Relationships' })).toBeInTheDocument();
    expect(screen.getByText(/Auto — detect relationships from schema/)).toBeInTheDocument();
  });

  it('shows Related Tables when joinable tables are suggested', () => {
    renderJoinSelector({
      suggestedJoinableTables: ['customers'],
      joinedTables: [],
    });

    expect(screen.getByText('Related Tables')).toBeInTheDocument();
  });

  it('shows Related Tables when tables are already joined', () => {
    renderJoinSelector({
      suggestedJoinableTables: [],
      joinedTables: ['customers'],
    });

    expect(screen.getByText('Related Tables')).toBeInTheDocument();
  });

  it('offers Add tables by pattern unconditionally now that there is no switch mode', () => {
    renderJoinSelector();

    expect(screen.getByRole('button', { name: 'Add tables by pattern' })).toBeEnabled();
  });
});

describe('CompactMetadataSelector — database mirror', () => {
  const ADD_DB_LABEL = 'Add matching tables from database';

  const renderMirrorSelector = (
    overrides: Partial<React.ComponentProps<typeof CompactMetadataSelector>> = {}
  ) => {
    const onAddUnionTables = jest.fn();
    const onRemoveUnionTables = jest.fn();
    const onAddUnionTable = jest.fn();
    render(
      <DataSourceProvider>
        <CompactMetadataSelector
          connectionType="clickhouse"
          selectedDatabase="prod_us"
          selectedTable="orders"
          databases={[{ name: 'prod_us' }, { name: 'prod_eu' }]}
          tables={[{ name: 'orders' }, { name: 'events' }]}
          tablesCache={{
            prod_us: [{ name: 'orders' }, { name: 'events' }],
            prod_eu: [{ name: 'orders' }, { name: 'events' }],
          }}
          unionTables={[{ database: 'prod_us', table_name: 'events' }]}
          isLoadingMetadata={false}
          metadataError={null}
          onDatabaseSelect={jest.fn()}
          onTableSelect={jest.fn()}
          onAddUnionTable={onAddUnionTable}
          onAddUnionTables={onAddUnionTables}
          onRemoveUnionTables={onRemoveUnionTables}
          onLoadTablesForDatabase={jest.fn()}
          {...overrides}
        />
      </DataSourceProvider>
    );
    return { onAddUnionTables, onRemoveUnionTables, onAddUnionTable };
  };

  const mirrorFromProdEu = () => {
    fireEvent.mouseDown(screen.getByPlaceholderText('Database'));
    fireEvent.click(screen.getByRole('option', { name: 'prod_eu' }));
    fireEvent.click(screen.getByRole('button', { name: ADD_DB_LABEL }));
  };

  // One dispatch, not one per table: the merged-columns effect keys on
  // `unionTables` identity, so N dispatches would cost N round trips.
  it('adds the whole mirrored set in a single batched call', () => {
    const { onAddUnionTables, onAddUnionTable } = renderMirrorSelector();

    mirrorFromProdEu();

    expect(onAddUnionTables).toHaveBeenCalledTimes(1);
    expect(onAddUnionTables).toHaveBeenCalledWith([
      { database: 'prod_eu', table_name: 'orders' },
      { database: 'prod_eu', table_name: 'events' },
    ]);
    expect(onAddUnionTable).not.toHaveBeenCalled();
  });

  // Tables that landed announce themselves by appearing in Selected Tables.
  it('says nothing when everything came over', () => {
    renderMirrorSelector();

    mirrorFromProdEu();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('badges the tables the database did not have', () => {
    renderMirrorSelector({
      tablesCache: {
        prod_us: [{ name: 'orders' }, { name: 'events' }],
        prod_eu: [{ name: 'orders' }],
      },
    });

    mirrorFromProdEu();

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('1 table not in prod_eu');
    // The names themselves are in the tooltip, so a wide database cannot
    // stretch the panel.
    expect(badge).toHaveAttribute('title', 'events');
  });

  it('drops the badge on its own', async () => {
    jest.useFakeTimers();
    try {
      renderMirrorSelector({
        tablesCache: {
          prod_us: [{ name: 'orders' }, { name: 'events' }],
          prod_eu: [{ name: 'orders' }],
        },
      });

      mirrorFromProdEu();
      expect(screen.getByRole('status')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(6000);
      });
      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('offers no undo', () => {
    const { onRemoveUnionTables } = renderMirrorSelector();

    mirrorFromProdEu();

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(onRemoveUnionTables).not.toHaveBeenCalled();
  });

  it('hides the add-database action when no batched setter is wired', () => {
    renderMirrorSelector({ onAddUnionTables: undefined });

    expect(screen.queryByRole('button', { name: ADD_DB_LABEL })).not.toBeInTheDocument();
  });
});
