import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DiscreteFilterControl from './DiscreteFilterControl';
import { DiscreteFilterMetadata } from '../../../types';

const buildMetadata = (availableValues: any[]): DiscreteFilterMetadata => ({
  fieldId: 'category',
  columnName: 'category',
  type: 'discrete',
  loading: false,
  availableValues,
});

describe('DiscreteFilterControl', () => {
  test('filters the rendered list even when all values are selected', () => {
    render(
      <DiscreteFilterControl
        metadata={buildMetadata(['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda'])}
        selectedValues={['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda']}
        onChange={jest.fn()}
        onRefetchValues={jest.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search values...'), {
      target: { value: 'om' },
    });

    expect(screen.getByText('Omega')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();
  });
});