// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    fireEvent.click(screen.getByRole('button', { name: 'Add by pattern' }));

    expect(screen.getByRole('dialog', { name: 'Add Tables By Pattern' })).toBeInTheDocument();
    expect(screen.getByLabelText('Collapse data source')).toHaveAttribute('aria-expanded', 'true');
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
});
