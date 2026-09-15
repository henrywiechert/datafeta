// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ContinuousFilterControl from './ContinuousFilterControl';
import { ContinuousFilterMetadata } from '../../../types';

const buildMetadata = (
  min: number | null,
  max: number | null,
  overrides?: Partial<ContinuousFilterMetadata>,
): ContinuousFilterMetadata => ({
  fieldId: 'price',
  columnName: 'price',
  type: 'continuous',
  loading: false,
  min,
  max,
  ...overrides,
});

/**
 * Mirrors the real parent: it stores what the control commits, so a commit of
 * already-committed values produces no prop change (the case that used to leave
 * rejected text in the field).
 */
const Harness: React.FC<{
  metadata: ContinuousFilterMetadata;
  initialMin?: number | null;
  initialMax?: number | null;
  initialAdapt?: boolean;
  onChange?: jest.Mock;
}> = ({ metadata, initialMin = null, initialMax = null, initialAdapt, onChange }) => {
  const [min, setMin] = React.useState<number | null>(initialMin);
  const [max, setMax] = React.useState<number | null>(initialMax);
  const [adapt, setAdapt] = React.useState<boolean | undefined>(initialAdapt);

  return (
    <ContinuousFilterControl
      metadata={metadata}
      min={min}
      max={max}
      adaptToRange={adapt}
      onChange={(newMin, newMax, newAdapt) => {
        onChange?.(newMin, newMax, newAdapt);
        setMin(newMin);
        setMax(newMax);
        setAdapt(newAdapt);
      }}
    />
  );
};

const minInput = () => screen.getByLabelText('Min') as HTMLInputElement;
const maxInput = () => screen.getByLabelText('Max') as HTMLInputElement;

const commit = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

describe('ContinuousFilterControl', () => {
  it('shows the clamped bound even when the clamp matches the committed value', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(0, 10)} initialMin={10} initialMax={10} onChange={onChange} />);

    commit(minInput(), '50');

    // 50 clamps to 10, which is already committed, so no prop change arrives.
    expect(minInput().value).toBe('10');
  });

  it('treats a whitespace-only field as unbounded rather than zero', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(-5, 10)} initialMin={3} initialMax={8} onChange={onChange} />);

    commit(minInput(), '  ');

    expect(onChange).toHaveBeenCalledWith(null, 8, expect.anything());
    expect(minInput().value).toBe('');
  });

  it('commits a typed bound once when Enter is followed by blur', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(0, 100)} initialMin={0} initialMax={100} onChange={onChange} />);

    fireEvent.change(maxInput(), { target: { value: '42' } });
    fireEvent.keyDown(maxInput(), { key: 'Enter' });
    fireEvent.blur(maxInput());

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0, 42, expect.anything());
  });

  it('renders no slider for a single-valued column', () => {
    render(<Harness metadata={buildMetadata(7, 7)} initialMin={7} initialMax={7} />);

    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('Single value: 7')).toBeInTheDocument();
  });

  it('turns adapt on even when both bounds sit inside the dataset range', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(0, 100)} initialMin={20} initialMax={80} onChange={onChange} />);

    const toggle = screen.getByLabelText('Adapt bounds to dataset range');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith(20, 80, true);
    expect(toggle).toBeChecked();
  });

  it('nulls a bound dragged to the dataset extreme while adapt is on, and keeps it on', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(0, 100)} initialMin={20} initialMax={80} initialAdapt onChange={onChange} />);

    commit(maxInput(), '100');

    expect(onChange).toHaveBeenCalledWith(20, null, true);
    expect(maxInput().value).toBe('');
  });

  it('materialises unbounded ends when adapt is switched off', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(-2, 55)} initialMin={null} initialMax={null} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Adapt bounds to dataset range'));

    expect(onChange).toHaveBeenCalledWith(-2, 55, false);
    expect(minInput().value).toBe('-2');
    expect(maxInput().value).toBe('55');
  });

  it('labels the slider thumbs', () => {
    render(<Harness metadata={buildMetadata(0, 10)} initialMin={2} initialMax={8} />);

    expect(screen.getByLabelText('Minimum value')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum value')).toBeInTheDocument();
  });

  it('reverts invalid text to the committed bound', () => {
    const onChange = jest.fn();
    render(<Harness metadata={buildMetadata(0, 10)} initialMin={4} initialMax={9} onChange={onChange} />);

    commit(minInput(), 'abc');

    expect(onChange).not.toHaveBeenCalled();
    expect(minInput().value).toBe('4');
  });
});
