// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FieldsPanel from './FieldsPanel';
import { Field } from '../../../types';

jest.mock('./FieldCategory', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

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

const sampleField = (overrides: Partial<Field> = {}): Field => ({
  id: 'f1',
  columnName: 'amount',
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  ...overrides,
});

const renderPanel = (overrides: Partial<React.ComponentProps<typeof FieldsPanel>> = {}) =>
  render(
    <FieldsPanel
      availableFields={[sampleField()]}
      fieldsSearch=""
      onFieldsSearchChange={jest.fn()}
      onFieldUpdate={jest.fn()}
      onRemoveFromAxis={jest.fn()}
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

describe('FieldsPanel collapsible sections', () => {
  it('collapses Data Source and shows the selected table hint', async () => {
    renderPanel();

    expect(screen.getByPlaceholderText('Search Table')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Collapse data source'));

    expect(screen.getByLabelText('Expand data source')).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search Table')).not.toBeVisible();
    });
    expect(screen.getByText('sample.csv', { selector: 'span' })).toBeInTheDocument();
    expect(window.localStorage.getItem('fieldsPanel.dataSource.expanded')).toBe('false');
  });

  it('collapses Fields and hides search plus field lists', async () => {
    renderPanel();

    expect(screen.getByLabelText('Search fields')).toBeVisible();
    expect(screen.getByText('Measures')).toBeVisible();

    fireEvent.click(screen.getByLabelText('Collapse fields'));

    expect(screen.getByLabelText('Expand fields')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Search fields')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regex' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Measures')).not.toBeVisible();
    });
    expect(window.localStorage.getItem('fieldsPanel.fields.expanded')).toBe('false');
  });

  it('restores collapsed Data Source state from localStorage', () => {
    window.localStorage.setItem('fieldsPanel.dataSource.expanded', 'false');
    renderPanel();

    expect(screen.getByLabelText('Expand data source')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search Table')).not.toBeVisible();
  });

  it('does not collapse Data Source when refresh is clicked', () => {
    const onRefreshMetadata = jest.fn();
    renderPanel({ onRefreshMetadata });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh metadata' }));

    expect(onRefreshMetadata).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Collapse data source')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByPlaceholderText('Search Table')).toBeVisible();
  });

  it('opens the ClickHouse pattern picker from the header without collapsing Data Source', () => {
    renderPanel({
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
});
