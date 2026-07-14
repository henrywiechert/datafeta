// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import PanelResizeHandleWithToggle from './PanelResizeHandleWithToggle';

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

function createPanelRef() {
  const resize = jest.fn();
  const panel: PanelImperativeHandle = {
    collapse: jest.fn(),
    expand: jest.fn(),
    getSize: () => ({ asPercentage: 15, inPixels: 300 }),
    isCollapsed: () => false,
    resize,
  };

  return {
    panelRef: { current: panel } as React.RefObject<PanelImperativeHandle>,
    resize,
  };
}

describe('PanelResizeHandleWithToggle deferred resizing', () => {
  it('moves the preview without resizing until pointer release', () => {
    const { panelRef, resize } = createPanelRef();
    render(
      <PanelResizeHandleWithToggle
        onDoubleClick={jest.fn()}
        deferredPanelRef={panelRef}
        minSizePercent={10}
        maxSizePercent={30}
      />,
    );

    const separator = screen.getByRole('separator', {
      name: 'Resize properties and chart panels',
    });
    // The outer library separator is disabled so it cannot apply a live resize
    // in parallel with this handle's deferred resize.
    expect(separator.parentElement).toHaveAttribute('data-separator', 'disabled');
    expect(separator.parentElement).toHaveAttribute('aria-disabled', 'true');

    fireEvent.pointerDown(separator, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 200 });

    expect(resize).not.toHaveBeenCalled();

    fireEvent.pointerUp(window);
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledWith('20%');
  });

  it('retains keyboard resizing', () => {
    const { panelRef, resize } = createPanelRef();
    render(
      <PanelResizeHandleWithToggle
        onDoubleClick={jest.fn()}
        deferredPanelRef={panelRef}
        minSizePercent={10}
        maxSizePercent={30}
      />,
    );

    fireEvent.keyDown(screen.getByRole('separator', {
      name: 'Resize properties and chart panels',
    }), { key: 'ArrowRight' });

    expect(resize).toHaveBeenCalledWith('16%');
  });
});
