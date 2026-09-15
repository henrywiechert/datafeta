// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SplitHandle from './SplitHandle';
import { SPLIT_KEYBOARD_STEP_PX } from './layoutTokens';

jest.mock('react-resizable-panels', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    Separator: ({
      children,
      disabled,
      id,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      id?: string;
    }) => ReactModule.createElement('div', {
      'aria-disabled': disabled,
      'data-separator': disabled ? 'disabled' : 'inactive',
      id,
    }, children),
  };
});

const BOUNDS = { currentPx: 300, minPx: 200, maxPx: 500 };

function renderHandle(overrides: Partial<React.ComponentProps<typeof SplitHandle>> = {}) {
  const onCommitPx = jest.fn();
  const props: React.ComponentProps<typeof SplitHandle> = {
    orientation: 'vertical',
    ariaLabel: 'Resize Fields panel',
    getBounds: () => BOUNDS,
    onCommitPx,
    ...overrides,
  };
  render(<SplitHandle {...props} />);
  const handle = screen.getByRole('separator', { name: props.ariaLabel });
  return { handle, onCommitPx };
}

describe('SplitHandle', () => {
  it('previews the drag and only resizes on pointer release', () => {
    const { handle, onCommitPx } = renderHandle();
    const preview = screen.getByTestId('split-handle-preview');

    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 180 });

    expect(onCommitPx).not.toHaveBeenCalled();
    expect(preview).toHaveStyle({ display: 'block', transform: 'translateX(80px)' });

    fireEvent.pointerUp(window);
    expect(onCommitPx).toHaveBeenCalledTimes(1);
    expect(onCommitPx).toHaveBeenCalledWith(380);
    expect(preview).toHaveStyle({ display: 'none' });
  });

  it('clamps the preview and the committed size to the bounds', () => {
    const { handle, onCommitPx } = renderHandle();
    const preview = screen.getByTestId('split-handle-preview');

    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 900 });

    // Stops at maxPx (500) rather than following the pointer to 1100.
    expect(preview).toHaveStyle({ transform: 'translateX(200px)' });

    fireEvent.pointerUp(window);
    expect(onCommitPx).toHaveBeenCalledWith(500);
  });

  it('inverts the drag direction for a panel after the handle', () => {
    const { handle, onCommitPx } = renderHandle({ panelSide: 'after' });

    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 60 });
    fireEvent.pointerUp(window);

    // Dragging left grows a panel that lives to the right of the handle.
    expect(onCommitPx).toHaveBeenCalledWith(340);
  });

  it('abandons the drag on Escape without resizing', () => {
    const { handle, onCommitPx } = renderHandle();
    const preview = screen.getByTestId('split-handle-preview');

    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 180 });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCommitPx).not.toHaveBeenCalled();
    expect(preview).toHaveStyle({ display: 'none' });

    // The abandoned gesture is fully detached.
    fireEvent.pointerMove(window, { clientX: 260 });
    fireEvent.pointerUp(window);
    expect(onCommitPx).not.toHaveBeenCalled();
  });

  it('resizes by keyboard', () => {
    const { handle, onCommitPx } = renderHandle();

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommitPx).toHaveBeenLastCalledWith(BOUNDS.currentPx + SPLIT_KEYBOARD_STEP_PX);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onCommitPx).toHaveBeenLastCalledWith(BOUNDS.currentPx - SPLIT_KEYBOARD_STEP_PX);

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onCommitPx).toHaveBeenLastCalledWith(BOUNDS.minPx);

    fireEvent.keyDown(handle, { key: 'End' });
    expect(onCommitPx).toHaveBeenLastCalledWith(BOUNDS.maxPx);
  });

  it('maps arrow keys to panel size, not screen direction, for an after panel', () => {
    const { handle, onCommitPx } = renderHandle({ panelSide: 'after' });

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommitPx).toHaveBeenLastCalledWith(BOUNDS.currentPx - SPLIT_KEYBOARD_STEP_PX);
  });

  it('toggles the adjacent panel on double click and Enter', () => {
    const onToggle = jest.fn();
    const { handle } = renderHandle({ onToggle });

    fireEvent.doubleClick(handle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('disables the library separator it renders inside a panel group', () => {
    const { handle } = renderHandle({ inGroup: true });

    // The library separator must not apply a live resize in parallel with this
    // handle's deferred one.
    expect(handle.parentElement).toHaveAttribute('data-separator', 'disabled');
    expect(handle.parentElement).toHaveAttribute('aria-disabled', 'true');
  });

  it('refuses the gesture when bounds are unavailable', () => {
    const { handle, onCommitPx } = renderHandle({ getBounds: () => null });
    const preview = screen.getByTestId('split-handle-preview');

    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 180 });
    fireEvent.pointerUp(window);

    expect(onCommitPx).not.toHaveBeenCalled();
    expect(preview).toHaveStyle({ display: 'none' });
  });

  it('drags a horizontal split along the Y axis', () => {
    const { handle, onCommitPx } = renderHandle({
      orientation: 'horizontal',
      panelSide: 'after',
      ariaLabel: 'Resize debug view',
    });
    const preview = screen.getByTestId('split-handle-preview');

    fireEvent.pointerDown(handle, { button: 0, clientY: 400 });
    fireEvent.pointerMove(window, { clientY: 350 });

    expect(preview).toHaveStyle({ transform: 'translateY(-50px)' });

    fireEvent.pointerUp(window);
    // Dragging the handle up grows the drawer below it.
    expect(onCommitPx).toHaveBeenCalledWith(350);
  });
});
