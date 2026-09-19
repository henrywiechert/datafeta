// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import AxisGlyph from './AxisGlyph';

describe('AxisGlyph', () => {
  it('names the emphasized axis', () => {
    const { rerender } = render(<AxisGlyph emphasis="x" />);
    expect(screen.getByRole('img', { name: 'X axis' })).toBeInTheDocument();

    rerender(<AxisGlyph emphasis="y" />);
    expect(screen.getByRole('img', { name: 'Y axis' })).toBeInTheDocument();
  });

  it('draws four dots on the weak arm for both axes', () => {
    const { container, rerender } = render(<AxisGlyph emphasis="x" />);
    expect(container.querySelectorAll('circle')).toHaveLength(4);

    rerender(<AxisGlyph emphasis="y" />);
    expect(container.querySelectorAll('circle')).toHaveLength(4);
  });
});
