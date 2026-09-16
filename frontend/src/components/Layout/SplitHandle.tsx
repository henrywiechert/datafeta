// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Box, Tooltip } from '@mui/material';
import { Separator } from 'react-resizable-panels';
import {
  SPLIT_HANDLE_THICKNESS_PX,
  SPLIT_HOVER_BACKDROP_COLOR,
  SPLIT_KEYBOARD_STEP_PX,
  SPLIT_LINE_ACTIVE_COLOR,
  SPLIT_LINE_ACTIVE_THICKNESS_PX,
  SPLIT_LINE_COLOR,
  SPLIT_LINE_THICKNESS_PX,
  SPLIT_PREVIEW_Z_INDEX,
} from './layoutTokens';
import {
  SplitBounds,
  SplitOrientation,
  SplitPanelSide,
  useSplitDrag,
} from './useSplitDrag';

/**
 * Whether the handle sits between two panel *cards* or divides two regions of
 * one card.
 *
 * Between cards the canvas gap already reads as the boundary, so drawing a line
 * on top of it just adds noise — the handle stays invisible until hovered.
 * Within a card there is no gap, so the resting line is what tells you the
 * boundary is draggable at all.
 */
export type SplitHandleVariant = 'gap' | 'divider';

export interface SplitHandleProps {
  /** `vertical` = a vertical divider between columns. */
  orientation: SplitOrientation;
  /** Defaults to `divider`; use `gap` between panel cards. */
  variant?: SplitHandleVariant;
  /** Which side of the handle the resized panel is on. Default `before`. */
  panelSide?: SplitPanelSide;
  /** Screen-reader name, e.g. "Resize Fields panel". */
  ariaLabel: string;
  /** Read live bounds at gesture start; see `useSplitDrag`. */
  getBounds: () => SplitBounds | null;
  /** Apply a final size, in pixels. */
  onCommitPx: (px: number) => void;
  /** Double-click action. Collapses/expands the adjacent panel. */
  onToggle?: () => void;
  /**
   * Wrap in a react-resizable-panels `Separator` — required when the handle
   * sits between two `Panel`s so the group accounts for its width.
   */
  inGroup?: boolean;
  separatorId?: string;
}

/**
 * The one resize handle in the app: a 6px pointer target drawing a 1px
 * divider that thickens to a 2px accent on hover, with a drag preview line,
 * double-click to collapse, and arrow-key resizing.
 *
 * Inside a panel group the library `Separator` is rendered `disabled`. That is
 * deliberate, not an oversight: react-resizable-panels stays the sizing and
 * constraint engine (px/%/rem units, collapse, imperative API), while this
 * component owns the *gesture*, because the library's own drag resizes live and
 * the chart column cannot afford to re-lay-out mid-drag. See `useSplitDrag`.
 */
const SplitHandle: React.FC<SplitHandleProps> = ({
  orientation,
  variant = 'divider',
  panelSide = 'before',
  ariaLabel,
  getBounds,
  onCommitPx,
  onToggle,
  inGroup = false,
  separatorId,
}) => {
  const isVertical = orientation === 'vertical';
  const {
    isDragging,
    dragSizePx,
    handleRef,
    previewRef,
    onPointerDown,
    nudge,
    jumpTo,
  } = useSplitDrag({ orientation, panelSide, getBounds, onCommitPx });

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    if (!onToggle) return;
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  }, [onToggle]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Arrow keys move the divider; on an `after` panel the divider and the
    // panel size grow in opposite directions.
    const towardsEnd = isVertical ? 'ArrowRight' : 'ArrowDown';
    const towardsStart = isVertical ? 'ArrowLeft' : 'ArrowUp';
    const growSign = panelSide === 'before' ? 1 : -1;

    if (event.key === towardsEnd) {
      event.preventDefault();
      nudge(growSign * SPLIT_KEYBOARD_STEP_PX);
    } else if (event.key === towardsStart) {
      event.preventDefault();
      nudge(-growSign * SPLIT_KEYBOARD_STEP_PX);
    } else if (event.key === 'Home') {
      event.preventDefault();
      jumpTo('min');
    } else if (event.key === 'End') {
      event.preventDefault();
      jumpTo('max');
    } else if (event.key === 'Enter' && onToggle) {
      event.preventDefault();
      onToggle();
    }
  }, [isVertical, jumpTo, nudge, onToggle, panelSide]);

  const handle = (
    <Box
      ref={handleRef}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      aria-valuenow={dragSizePx !== null ? Math.round(dragSizePx) : undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onToggle ? handleDoubleClick : undefined}
      sx={{
        position: 'relative',
        flex: `0 0 ${SPLIT_HANDLE_THICKNESS_PX}px`,
        cursor: isVertical ? 'col-resize' : 'row-resize',
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        transition: 'background-color 0.15s',
        ...(isVertical
          ? { width: SPLIT_HANDLE_THICKNESS_PX, height: '100%' }
          : { height: SPLIT_HANDLE_THICKNESS_PX, width: '100%' }),
        // While dragging, the resting line stays thin — only the preview moves.
        ...(isDragging ? {} : {
          // Hover thickens the line only. Tinting the handle's full width as
          // well made a boundary this narrow read as a heavy band.
          '&:hover::after': {
            backgroundColor: SPLIT_LINE_ACTIVE_COLOR,
            ...(isVertical
              ? { width: SPLIT_LINE_ACTIVE_THICKNESS_PX }
              : { height: SPLIT_LINE_ACTIVE_THICKNESS_PX }),
          },
          // Keyboard focus keeps the backdrop: a 2px line alone is too quiet
          // to serve as a focus indicator.
          '&:focus-visible': { backgroundColor: SPLIT_HOVER_BACKDROP_COLOR, outline: 'none' },
          '&:focus-visible::after': {
            backgroundColor: SPLIT_LINE_ACTIVE_COLOR,
            ...(isVertical
              ? { width: SPLIT_LINE_ACTIVE_THICKNESS_PX }
              : { height: SPLIT_LINE_ACTIVE_THICKNESS_PX }),
          },
        }),
        // The resting divider. Transparent in `gap` variant: between two cards
        // the canvas showing through is the boundary, and the accent still
        // appears on hover.
        '&::after': {
          content: '""',
          position: 'absolute',
          backgroundColor: variant === 'gap' ? 'transparent' : SPLIT_LINE_COLOR,
          transition: isDragging ? 'none' : 'background-color 0.15s, width 0.15s, height 0.15s',
          ...(isVertical
            ? {
                top: 0,
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: SPLIT_LINE_THICKNESS_PX,
              }
            : {
                left: 0,
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                height: SPLIT_LINE_THICKNESS_PX,
              }),
        },
      }}
    />
  );

  // Size readout only while dragging — a tooltip on every hover would be noise.
  const handleWithReadout = (
    <Tooltip
      title={dragSizePx !== null ? `${Math.round(dragSizePx)}px` : ''}
      open={isDragging}
      placement={isVertical ? 'top' : 'left'}
      arrow
    >
      {handle}
    </Tooltip>
  );

  return (
    <>
      {createPortal(
        <Box
          ref={previewRef}
          data-testid="split-handle-preview"
          sx={{
            display: 'none',
            position: 'fixed',
            backgroundColor: SPLIT_LINE_ACTIVE_COLOR,
            pointerEvents: 'none',
            zIndex: SPLIT_PREVIEW_Z_INDEX,
          }}
        />,
        document.body,
      )}
      {inGroup ? (
        <Separator
          id={separatorId}
          disabled
          style={{ flex: `0 0 ${SPLIT_HANDLE_THICKNESS_PX}px`, position: 'relative' }}
        >
          {handleWithReadout}
        </Separator>
      ) : (
        handleWithReadout
      )}
    </>
  );
};

export default SplitHandle;
