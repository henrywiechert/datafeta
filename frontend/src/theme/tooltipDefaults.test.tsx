// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Tooltip } from '@mui/material';
import ThemeRoot from './ThemeRoot';

/**
 * A tooltip that lingers once the pointer leaves its trigger covers the
 * neighbouring control the user is heading for and swallows its hover. The
 * theme makes every Tooltip non-interactive so that cannot happen; these
 * tests pin that default for a Tooltip that sets no props of its own.
 */
describe('theme Tooltip defaults', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const renderTooltip = () => render(
    <ThemeRoot>
      <Tooltip title="Tip text">
        <button type="button">Trigger</button>
      </Tooltip>
    </ThemeRoot>,
  );

  const hoverTrigger = () => {
    fireEvent.mouseOver(screen.getByText('Trigger'));
    act(() => { jest.runAllTimers(); });
    return screen.getByRole('tooltip');
  };

  it('renders the popper without the interactive class, so it ignores the pointer', () => {
    renderTooltip();
    const popper = hoverTrigger();

    expect(popper).toHaveClass('MuiTooltip-popper');
    expect(popper).not.toHaveClass('MuiTooltip-popperInteractive');
  });

  it('closes when the pointer leaves the trigger, even if it moves onto the tooltip', async () => {
    renderTooltip();
    const popper = hoverTrigger();

    fireEvent.mouseLeave(screen.getByText('Trigger'));
    fireEvent.mouseOver(popper);

    // waitFor advances the fake timers through the exit transition too.
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
});
