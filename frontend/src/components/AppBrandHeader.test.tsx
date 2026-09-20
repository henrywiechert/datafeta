// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import AppBrandHeader from './AppBrandHeader';

describe('AppBrandHeader', () => {
  it('renders the DataSlicer badge and the file menu next to help', () => {
    render(<AppBrandHeader fileMenu={<button type="button">file menu</button>} />);
    expect(screen.getByText('DataSlicer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'file menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
  });
});
