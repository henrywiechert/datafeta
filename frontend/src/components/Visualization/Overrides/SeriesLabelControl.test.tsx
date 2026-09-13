// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SeriesLabelControl from './SeriesLabelControl';

describe('SeriesLabelControl', () => {
  test('opens a popover with the three modes and reports a change', () => {
    const onChange = jest.fn();
    render(<SeriesLabelControl value="off" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Series labels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Line end' }));

    expect(onChange).toHaveBeenCalledWith('end');
  });

  test('marks the icon as expanded while the popover is open', () => {
    render(<SeriesLabelControl value="endInside" onChange={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Series labels' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveAttribute('aria-pressed', 'true');
  });
});
