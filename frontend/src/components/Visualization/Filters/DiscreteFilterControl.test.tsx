// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DiscreteFilterControl from './DiscreteFilterControl';
import { DiscreteFilterMatchMode, DiscreteFilterMetadata, DiscretePatternOperator } from '../../../types';

const buildMetadata = (availableValues: any[]): DiscreteFilterMetadata => ({
  fieldId: 'category',
  columnName: 'category',
  type: 'discrete',
  loading: false,
  availableValues,
});

const Harness: React.FC<{
  metadata: DiscreteFilterMetadata;
  selectedValues?: any[];
  onPatternChange?: jest.Mock;
}> = ({ metadata, selectedValues = [], onPatternChange }) => {
  const [matchMode, setMatchMode] = React.useState<DiscreteFilterMatchMode>('selection');
  const [pattern, setPattern] = React.useState('');
  const [patternOperator, setPatternOperator] = React.useState<DiscretePatternOperator>('like');
  const [isInversePattern, setIsInversePattern] = React.useState(false);

  return (
    <DiscreteFilterControl
      metadata={metadata}
      selectedValues={selectedValues}
      matchMode={matchMode}
      pattern={pattern}
      patternOperator={patternOperator}
      isInversePattern={isInversePattern}
      onChange={jest.fn()}
      onPatternChange={(config) => {
        setMatchMode(config.matchMode);
        setPattern(config.pattern);
        setPatternOperator(config.patternOperator);
        setIsInversePattern(config.isInversePattern);
        onPatternChange?.(config);
      }}
      onRefetchValues={jest.fn().mockResolvedValue(undefined)}
    />
  );
};

describe('DiscreteFilterControl', () => {
  test('filters the rendered list even when all values are selected', () => {
    const handlePatternChange = jest.fn();

    render(
      <Harness
        metadata={buildMetadata(['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda'])}
        selectedValues={['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda']}
        onPatternChange={handlePatternChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search values...'), {
      target: { value: 'om' },
    });

    expect(screen.getByText('Omega')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
    expect(handlePatternChange).not.toHaveBeenCalled();
  });

  test('switches to pattern mode and emits persisted pattern updates', () => {
    const handlePatternChange = jest.fn();

    render(
      <Harness
        metadata={buildMetadata(['Alpha', 'Beta'])}
        selectedValues={['Alpha']}
        onPatternChange={handlePatternChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pattern' }));
    expect(handlePatternChange).toHaveBeenCalledWith({
      matchMode: 'pattern',
      pattern: '',
      patternOperator: 'like',
      isInversePattern: false,
    });

    handlePatternChange.mockClear();
    fireEvent.change(screen.getByLabelText('Pattern'), {
      target: { value: '%ph%' },
    });

    expect(handlePatternChange).toHaveBeenCalledWith({
      matchMode: 'pattern',
      pattern: '%ph%',
      patternOperator: 'like',
      isInversePattern: false,
    });
  });
});