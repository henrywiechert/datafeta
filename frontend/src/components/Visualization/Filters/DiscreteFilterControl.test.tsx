// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DiscreteFilterControl from './DiscreteFilterControl';
import { DiscreteFilterMatchMode, DiscreteFilterMetadata, DiscretePatternOperator } from '../../../types';

const buildMetadata = (
  availableValues: any[],
  overrides?: Partial<DiscreteFilterMetadata>,
): DiscreteFilterMetadata => ({
  fieldId: 'category',
  columnName: 'category',
  type: 'discrete',
  loading: false,
  availableValues,
  ...overrides,
});

const Harness: React.FC<{
  metadata: DiscreteFilterMetadata;
  selectedValues?: any[];
  onPatternChange?: jest.Mock;
  onValueListModeChange?: jest.Mock;
  valueListMode?: 'all' | 'relevant';
  initialMatchMode?: DiscreteFilterMatchMode;
}> = ({
  metadata,
  selectedValues = [],
  onPatternChange,
  onValueListModeChange,
  valueListMode = 'all',
  initialMatchMode = 'selection',
}) => {
  const [matchMode, setMatchMode] = React.useState<DiscreteFilterMatchMode>(initialMatchMode);
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
      valueListMode={valueListMode}
      onChange={jest.fn()}
      onPatternChange={(config) => {
        setMatchMode(config.matchMode);
        setPattern(config.pattern);
        setPatternOperator(config.patternOperator);
        setIsInversePattern(config.isInversePattern);
        onPatternChange?.(config);
      }}
      onValueListModeChange={onValueListModeChange}
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
        metadata={buildMetadata(['Alpha', 'Beta'], { isPartial: true })}
        selectedValues={['Alpha']}
        onPatternChange={handlePatternChange}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pattern mode' }));
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

  test('calls onValueListModeChange when Respect other filters is toggled', () => {
    const handleMode = jest.fn();
    render(
      <Harness
        metadata={buildMetadata(['Alpha', 'Beta'])}
        selectedValues={['Alpha']}
        onValueListModeChange={handleMode}
        valueListMode="all"
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Respect other filters' }));
    expect(handleMode).toHaveBeenCalledWith('relevant');
  });

  test('offers pattern mode even when the value list is complete', () => {
    render(
      <Harness
        metadata={buildMetadata(['Alpha', 'Beta'])}
        selectedValues={['Alpha']}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Pattern mode' })).not.toBeChecked();
  });

  test('reflects an already active pattern filter on a complete list', () => {
    render(
      <Harness
        metadata={buildMetadata(['Alpha', 'Beta'])}
        selectedValues={['Alpha']}
        initialMatchMode="pattern"
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Pattern mode' })).toBeChecked();
  });

  test('hides the Respect other filters toggle in pattern mode', () => {
    render(
      <Harness
        metadata={buildMetadata(['Alpha', 'Beta'])}
        selectedValues={['Alpha']}
        onValueListModeChange={jest.fn()}
        initialMatchMode="pattern"
      />
    );

    expect(screen.queryByRole('checkbox', { name: 'Respect other filters' })).not.toBeInTheDocument();
  });

  const StatefulList: React.FC<{ values: any[]; initial: any[] }> = ({ values, initial }) => {
    const [selected, setSelected] = React.useState<any[]>(initial);
    return (
      <DiscreteFilterControl
        metadata={buildMetadata(values)}
        selectedValues={selected}
        onChange={setSelected}
        onPatternChange={jest.fn()}
        onRefetchValues={jest.fn().mockResolvedValue(undefined)}
      />
    );
  };

  const renderedValueOrder = () =>
    screen.getAllByRole('checkbox').map((cb) => cb.closest('label')?.textContent)
      .filter((t) => !['All', 'None', 'Pattern mode'].includes(t ?? ''));

  test('pins the initial selection on top', () => {
    render(<StatefulList values={['A', 'B', 'C', 'D']} initial={['C']} />);

    expect(renderedValueOrder()).toEqual(['C', 'A', 'B', 'D']);
    expect(screen.getByRole('button', { name: 'Selected (1)' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('updates the pinned group when items are checked/unchecked', () => {
    render(<StatefulList values={['A', 'B', 'C', 'D']} initial={['C']} />);

    expect(renderedValueOrder()[0]).toBe('C');

    fireEvent.click(screen.getByLabelText('B'));
    // Now B and C are selected; B comes first alphabetically
    expect(renderedValueOrder().slice(0, 2)).toEqual(['B', 'C']);

    fireEvent.click(screen.getByLabelText('C'));
    // Now only B is selected
    expect(renderedValueOrder()[0]).toBe('B');
    expect(screen.getByLabelText('B')).toBeChecked();
    expect(screen.getByLabelText('C')).not.toBeChecked();
  });

  test('keeps selected items at the top of search results', () => {
    const values = ['Apple', 'Apricot', 'Avocado', 'Banana', 'Blueberry', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew', 'Kiwi'];
    render(<StatefulList values={values} initial={[]} />);

    fireEvent.click(screen.getByLabelText('Apricot'));
    // Apricot is selected and should appear first in the full list
    expect(renderedValueOrder()[0]).toBe('Apricot');

    fireEvent.change(screen.getByPlaceholderText('Search values...'), { target: { value: 'Ap' } });
    // Search shows Apple and Apricot; Apricot (selected) should be first
    const order = renderedValueOrder();
    expect(order[0]).toBe('Apricot');
    expect(order).toContain('Apple');
  });

  test('keeps the same list element when the first value is selected', () => {
    const values = Array.from({ length: 30 }, (_, i) => `V${String(i).padStart(2, '0')}`);
    render(<StatefulList values={values} initial={[]} />);

    // A remounted scroll container starts at scrollTop 0, so identity is what matters.
    const listBefore = screen.getByLabelText('V25').closest('.checkboxList');
    fireEvent.click(screen.getByLabelText('V25'));

    expect(screen.getByRole('button', { name: 'Selected (1)' })).toBeInTheDocument();
    expect(screen.getByLabelText('V24').closest('.checkboxList')).toBe(listBefore);
    expect(listBefore).toBeInTheDocument();
  });

  test('collapses a large pinned group and expands it on click', () => {
    const values = Array.from({ length: 20 }, (_, i) => `V${String(i).padStart(2, '0')}`);
    render(<StatefulList values={values} initial={values.slice(0, 12)} />);

    const header = screen.getByRole('button', { name: 'Selected (12)' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('V00')).not.toBeInTheDocument();
    expect(renderedValueOrder()[0]).toBe('V12');
    expect(screen.getByText('12 of 20 selected')).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('V00')).toBeChecked();
  });

  test('does not group when every value is selected', () => {
    render(<StatefulList values={['A', 'B', 'C']} initial={['A', 'B', 'C']} />);

    expect(screen.queryByRole('button', { name: /^Selected/ })).not.toBeInTheDocument();
    expect(renderedValueOrder()).toEqual(['A', 'B', 'C']);
  });

  test('select all with numeric selection keeps an empty-string value matchable', () => {
    const Stateful: React.FC = () => {
      const [selected, setSelected] = React.useState<any[]>([101]);
      return (
        <DiscreteFilterControl
          metadata={buildMetadata([101, 102, ''])}
          selectedValues={selected}
          onChange={setSelected}
          onPatternChange={jest.fn()}
          onRefetchValues={jest.fn().mockResolvedValue(undefined)}
        />
      );
    };
    render(<Stateful />);

    fireEvent.click(screen.getByLabelText('Select all'));

    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument();
    const selectNone = screen.getByLabelText('Select none');
    expect(selectNone).toBeChecked();
    const valueBoxes = screen.getAllByRole('checkbox')
      .filter((cb) => cb.closest('label')?.textContent !== 'Pattern mode');
    expect(valueBoxes).toHaveLength(4);
    valueBoxes.forEach((cb) => expect(cb).toBeChecked());

    fireEvent.click(selectNone);
    expect(screen.getByText('0 of 3 selected')).toBeInTheDocument();
  });
});
