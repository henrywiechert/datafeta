// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { RefObject, useCallback, useEffect, useRef } from 'react';
import { Separator as PanelResizeHandle } from 'react-resizable-panels';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { Box } from '@mui/material';

interface PanelResizeHandleWithToggleProps {
  onDoubleClick: () => void;
  id?: string;
  deferredPanelRef?: RefObject<PanelImperativeHandle>;
  minSizePercent?: number;
  maxSizePercent?: number;
}

/**
 * A custom resize handle that supports double-click to toggle panel visibility.
 * Styled as a thin vertical bar that highlights on hover.
 */
const PanelResizeHandleWithToggle: React.FC<PanelResizeHandleWithToggleProps> = ({
  onDoubleClick,
  id,
  deferredPanelRef,
  minSizePercent = 0,
  maxSizePercent = 100,
}) => {
  const handleRef = useRef<HTMLDivElement>(null);
  const resizeLineRef = useRef<HTMLDivElement>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDoubleClick();
  }, [onDoubleClick]);

  const commitSize = useCallback((sizePercent: number) => {
    const clampedSize = Math.max(minSizePercent, Math.min(maxSizePercent, sizePercent));
    deferredPanelRef?.current?.resize(`${clampedSize}%`);
  }, [deferredPanelRef, maxSizePercent, minSizePercent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!deferredPanelRef?.current) return;

    const currentSize = deferredPanelRef.current.getSize().asPercentage;
    let nextSize: number | null = null;

    if (e.key === 'ArrowLeft') nextSize = currentSize - 1;
    if (e.key === 'ArrowRight') nextSize = currentSize + 1;
    if (e.key === 'Home') nextSize = minSizePercent;
    if (e.key === 'End') nextSize = maxSizePercent;

    if (nextSize !== null) {
      e.preventDefault();
      commitSize(nextSize);
    }
  }, [commitSize, deferredPanelRef, maxSizePercent, minSizePercent]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = deferredPanelRef?.current;
    const handle = handleRef.current;
    const resizeLine = resizeLineRef.current;
    if (!panel || !handle || !resizeLine || e.button !== 0) return;

    e.preventDefault();
    const startX = e.clientX;
    const startSize = panel.getSize();
    const groupWidth = startSize.asPercentage > 0
      ? startSize.inPixels / (startSize.asPercentage / 100)
      : handle.parentElement?.getBoundingClientRect().width ?? 0;
    if (groupWidth <= 0) return;

    let currentDelta = 0;
    const minDelta = ((minSizePercent - startSize.asPercentage) / 100) * groupWidth;
    const maxDelta = ((maxSizePercent - startSize.asPercentage) / 100) * groupWidth;

    resizeLine.style.display = 'block';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      currentDelta = Math.max(minDelta, Math.min(maxDelta, event.clientX - startX));
      resizeLine.style.transform = `translateX(${currentDelta}px)`;
    };

    const cancelDrag = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);
      resizeLine.style.display = 'none';
      resizeLine.style.transform = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      cancelDragRef.current = null;
    };

    const finishDrag = () => {
      cancelDrag();
      commitSize(startSize.asPercentage + (currentDelta / groupWidth) * 100);
    };

    cancelDragRef.current?.();
    cancelDragRef.current = cancelDrag;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cancelDrag);
  }, [commitSize, deferredPanelRef, maxSizePercent, minSizePercent]);

  useEffect(() => () => cancelDragRef.current?.(), []);

  const handleContent = (
    <Box
      ref={handleRef}
      onDoubleClick={handleDoubleClick}
      onPointerDown={deferredPanelRef ? handlePointerDown : undefined}
      onKeyDown={deferredPanelRef ? handleKeyDown : undefined}
      role={deferredPanelRef ? 'separator' : undefined}
      aria-orientation={deferredPanelRef ? 'vertical' : undefined}
      aria-label={deferredPanelRef ? 'Resize properties and chart panels' : undefined}
      aria-valuemin={deferredPanelRef ? minSizePercent : undefined}
      aria-valuemax={deferredPanelRef ? maxSizePercent : undefined}
      tabIndex={deferredPanelRef ? 0 : undefined}
      sx={{
        width: 6,
        height: '100%',
        backgroundColor: 'transparent',
        cursor: 'col-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        flex: '0 0 6px',
        transition: 'background-color 0.15s',
        '&:hover': {
          backgroundColor: 'action.hover',
        },
        '&:active': {
          backgroundColor: 'primary.light',
        },
        // Visual indicator line in the center
        '&::after': {
          content: '""',
          width: 2,
          height: 24,
          backgroundColor: 'divider',
          borderRadius: 1,
          transition: 'background-color 0.15s',
        },
        '&:hover::after': {
          backgroundColor: 'primary.main',
        },
      }}
    >
      {deferredPanelRef && (
        <Box
          ref={resizeLineRef}
          sx={{
            display: 'none',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 2,
            width: 2,
            backgroundColor: 'primary.main',
            pointerEvents: 'none',
            zIndex: 1300,
          }}
        />
      )}
    </Box>
  );

  return (
    <PanelResizeHandle id={id} disabled={Boolean(deferredPanelRef)}>
      {handleContent}
    </PanelResizeHandle>
  );
};

export default PanelResizeHandleWithToggle;
