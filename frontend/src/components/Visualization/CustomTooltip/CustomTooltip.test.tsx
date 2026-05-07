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

  test('shows a pinned comparison toggle and renders highlighted selected series when expanded', () => {
    render(
      <CustomTooltip
        x={10}
        y={20}
        fields={[{ label: 'Year', value: '2024' }]}
        visible
        pinned
        pinnedComparison={baseComparison}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'All Values At X' }));

    expect(screen.getByText('All Values At 2024')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'All Values At X' }));

    expect(screen.queryByText('+25.0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });
});