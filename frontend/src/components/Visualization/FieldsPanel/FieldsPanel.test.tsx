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
      selectedDatabase=""
      selectedTable="sample.csv"
      {...overrides}
    />
  );

describe('FieldsPanel collapsible sections', () => {
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

  it('no longer renders the Data Source section, which is its own card', () => {
    renderPanel();

    expect(screen.queryByLabelText('Collapse data source')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search Table')).not.toBeInTheDocument();
  });
});
