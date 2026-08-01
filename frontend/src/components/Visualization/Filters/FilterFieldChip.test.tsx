// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FilterFieldChip from './FilterFieldChip';
import { DiscreteFilterConfig, DiscreteFilterMetadata, Field } from '../../../types';

jest.mock('../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => ({ dispatch: jest.fn() }),
}));

jest.mock('../../../contexts/DataSourceContext', () => ({
  useDataSource: () => ({ dataSource: { fieldDisplayAliases: {} } }),
}));

// FieldChip's label truncation detection observes the DOM; jsdom has no ResizeObserver.
beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const field: Field = {
  id: 'category',
  columnName: 'category',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const filterConfig: DiscreteFilterConfig = {
  fieldId: 'category',
  columnName: 'category',
  type: 'discrete',
  selectedValues: ['a'],
};

const buildMetadata = (
  overrides?: Partial<DiscreteFilterMetadata>,
): DiscreteFilterMetadata => ({
  fieldId: 'category',
  columnName: 'category',
  type: 'discrete',
  loading: false,
  availableValues: ['a', 'b', 'c'],
  ...overrides,
});

const renderChip = (metadata: DiscreteFilterMetadata) => {
  const onConfigChange = jest.fn();
  render(
    <FilterFieldChip
      field={field}
      filterConfig={filterConfig}
      filterMetadata={metadata}
      onConfigChange={onConfigChange}
      onRemove={jest.fn()}
      onRefetchValues={jest.fn().mockResolvedValue(undefined)}
    />
  );
  return onConfigChange;
};

const clickValue = (valueLabel: string) => {
  const checkbox = screen.getByText(valueLabel).closest('label')?.querySelector('input');
  if (!checkbox) throw new Error(`No checkbox for value "${valueLabel}"`);
  fireEvent.click(checkbox);
};

describe('FilterFieldChip discrete cardinality hints', () => {
  test('derives totalAvailableCount and excludedValues from a complete list', () => {
    const onConfigChange = renderChip(buildMetadata());

    clickValue('b');

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedValues: ['a', 'b'],
        totalAvailableCount: 3,
        excludedValues: ['c'],
      }),
    );
  });

  test('omits them when the list is constrained by sibling filters (Relevant mode)', () => {
    const onConfigChange = renderChip(
      buildMetadata({ constrainedByOtherFilters: true }),
    );

    clickValue('b');

    // Deriving either field from a Relevant list makes the query builder treat
    // "all visible selected" as "all values selected" and drop the filter.
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedValues: ['a', 'b'],
        totalAvailableCount: undefined,
        excludedValues: undefined,
      }),
    );
  });

  test('omits them when the list is a partial sample', () => {
    const onConfigChange = renderChip(buildMetadata({ isPartial: true }));

    clickValue('b');

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAvailableCount: undefined,
        excludedValues: undefined,
      }),
    );
  });
});
