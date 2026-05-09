import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CustomTooltip } from './CustomTooltip';
import { PinnedTooltipComparison } from '../../../types';

describe('CustomTooltip', () => {
  const baseComparison: PinnedTooltipComparison = {
    title: 'All Values At 2024',
    comparisonBasis: 'plotted-dots',
    xLabel: 'Year',
    xValue: 2024,
    xFormattedValue: '2024',
    valueLabel: 'Revenue',
    items: [
      {
        seriesKey: 'alpha',
        seriesLabel: 'Alpha',
        colorHex: '#ff0000',
        value: 150,
        formattedValue: '150',
        percentDifference: 25,
        isSelected: false,
      },
      {
        seriesKey: 'beta',
        seriesLabel: 'Beta',
        colorHex: '#00ff00',
        value: 120,
        formattedValue: '120',
        percentDifference: 0,
        isSelected: true,
      },
    ],
  };

  test('shows checkbox in pinned state and comparison panel only when checked', () => {
    const { container, rerender } = render(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinned
        pinnedComparison={baseComparison}
        autoExpandPinnedComparison={false}
      />
    );

    // Checkbox visible, panel hidden
    expect(screen.getByRole('checkbox', { name: 'Show all values' })).toBeInTheDocument();
    expect(screen.queryByText('All Values At 2024')).not.toBeInTheDocument();

    rerender(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinned
        pinnedComparison={baseComparison}
        autoExpandPinnedComparison={true}
      />
    );

    // Now panel is visible too
    expect(screen.getByText('All Values At 2024')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
    expect(container.querySelector('.custom-tooltip__comparison-item--selected')).not.toBeNull();
  });

  test('hides comparison panel when pinned but autoExpandPinnedComparison is false', () => {
    render(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinned
        pinnedComparison={baseComparison}
        autoExpandPinnedComparison={false}
      />
    );

    expect(screen.queryByText('All Values At 2024')).not.toBeInTheDocument();
  });

  test('shows comparison panel on hover when autoExpandPinnedComparison is true', () => {
    render(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinnedComparison={baseComparison}
        autoExpandPinnedComparison={true}
      />
    );

    expect(screen.getByText('All Values At 2024')).toBeInTheDocument();
  });

  test('omits percentage text when comparison items suppress percentage differences', () => {
    render(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinned
        pinnedComparison={{
          ...baseComparison,
          items: baseComparison.items.map((item) => ({
            ...item,
            percentDifference: undefined,
          })),
        }}
      />
    );

    expect(screen.queryByText('+25.0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  test('shows chart-local mode toggle when pinned and calls back on click', () => {
    const onAutoExpandPinnedComparisonChange = jest.fn();

    render(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinned
        pinnedComparison={baseComparison}
        autoExpandPinnedComparison={true}
        onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
      />
    );

    expect(screen.getByText('All Values At 2024')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all values' }));

    expect(onAutoExpandPinnedComparisonChange).toHaveBeenCalledWith(false);
  });
});