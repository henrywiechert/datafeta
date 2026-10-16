// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
import type { SplitPreviewStyle } from './splitDragPreview';
import {
  SplitBounds,
  SplitOrientation,
  SplitPanelSide,
  useSplitDrag,
} from './useSplitDrag';
import { useTabletUi } from '../../hooks/useTabletUi';

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

/** Hook for the handle's hover rule to reveal the collapse button. */
const COLLAPSE_BUTTON_CLASS = 'split-handle-collapse';

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
   * Tooltip for a collapse button revealed while the handle is hovered or
   * focused, e.g. "Hide Fields (⌘B)". Clicking it runs `onToggle`. Pass it only
   * while the panel is expanded: a collapsed panel's rail has its own expand
   * button.
   */
  collapseLabel?: string;
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
 * double-click (or the hover-revealed button) to collapse, and arrow-key
 * resizing.
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
  collapseLabel,
  inGroup = false,
  separatorId,
}) => {
  const isVertical = orientation === 'vertical';
  const { isTablet } = useTabletUi();
  // Hover-revealed, so there is nothing to reveal it on a touch screen; tablet
  // mode has its own side-panel toggle in the chart toolbar.
  const showCollapseButton = !!collapseLabel && !!onToggle && !isTablet;
  // Tablet: keep the visual 4px gap, expand the invisible hit area around it.
  const hitPadPx = isTablet ? 12 : 0;
  // The drag preview is drawn on a canvas, which needs resolved values rather
  // than palette keys. Same accent as the hovered line; the readout matches an
  // MUI tooltip.
  const theme = useTheme();
  const previewStyle = useMemo<SplitPreviewStyle>(() => ({
    lineColor: SPLIT_LINE_ACTIVE_COLOR.split('.')
      .reduce<any>((node, key) => node?.[key], theme.palette) ?? theme.palette.primary.main,
    labelBackground: theme.palette.grey[700],
    labelColor: theme.palette.common.white,
    font: `${theme.typography.fontWeightMedium} 12px ${theme.typography.fontFamily}`,
  }), [theme]);
  const {
    isDragging,
    handleRef,
    overlayRef,
    previewRef,
    onPointerDown,
    nudge,
    jumpTo,
  } = useSplitDrag({ orientation, panelSide, getBounds, onCommitPx, previewStyle });

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

  // The chevron points the way the panel will go.
  const CollapseIcon = isVertical
    ? (panelSide === 'before' ? ChevronLeftIcon : ChevronRightIcon)
    : (panelSide === 'before' ? ExpandLessIcon : ExpandMoreIcon);

  const collapseButton = showCollapseButton && (
    <Tooltip title={collapseLabel} placement={isVertical ? 'right' : 'bottom'}>
      <IconButton
        className={COLLAPSE_BUTTON_CLASS}
        size="small"
        aria-label={collapseLabel}
        onClick={onToggle}
        // The button sits inside the handle: keep its pointer, double-click and
        // key events from also starting a drag or toggling a second time.
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        sx={{
          position: 'absolute',
          // Above the handle's `::after` line, which runs through its centre.
          zIndex: 1,
          // Centred on the handle, along its length as well as across it.
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 20,
          height: 20,
          p: 0,
          backgroundColor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          boxShadow: 1,
          color: 'text.secondary',
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.15s',
          '&:hover': { backgroundColor: 'background.paper', color: SPLIT_LINE_ACTIVE_COLOR },
          '&:focus-visible': { opacity: 1, pointerEvents: 'auto' },
        }}
      >
        <CollapseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );

  const handle = (
    <Box
      ref={handleRef}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onToggle ? handleDoubleClick : undefined}
      sx={{
        position: 'relative',
        flex: `0 0 ${SPLIT_HANDLE_THICKNESS_PX}px`,
        cursor: isVertical ? 'col-resize' : 'row-resize',
        // A finger drag here is a resize, never a browser pan (which would
        // cancel the gesture). Only on the handle: see index.css for why the
        // panel library's own touch-action is switched off.
        touchAction: 'none',
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        transition: 'background-color 0.15s',
        ...(isVertical
          ? { width: SPLIT_HANDLE_THICKNESS_PX, height: '100%' }
          : { height: SPLIT_HANDLE_THICKNESS_PX, width: '100%' }),
        // Invisible padded hit target for tablet fingers; layout footprint stays
        // at SPLIT_HANDLE_THICKNESS_PX so the visual gap is unchanged.
        ...(hitPadPx > 0
          ? {
              '&::before': {
                content: '""',
                position: 'absolute',
                ...(isVertical
                  ? { top: 0, bottom: 0, left: -hitPadPx, right: -hitPadPx }
                  : { left: 0, right: 0, top: -hitPadPx, bottom: -hitPadPx }),
              },
            }
          : {}),
        // While dragging, the resting line stays thin — only the preview moves.
        ...(isDragging ? {} : {
          // Reveal the collapse button with the hover/focus accent.
          [`&:hover .${COLLAPSE_BUTTON_CLASS}, &:focus-visible .${COLLAPSE_BUTTON_CLASS}`]: {
            opacity: 1,
            pointerEvents: 'auto',
          },
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
    >
      {collapseButton}
    </Box>
  );

  return (
    <>
      {createPortal(
        // Drag-only layer; positioned and shown by useSplitDrag, never
        // re-rendered mid-gesture.
        <Box
          ref={overlayRef}
          data-testid="split-handle-overlay"
          sx={{
            display: 'none',
            position: 'fixed',
            inset: 0,
            zIndex: SPLIT_PREVIEW_Z_INDEX,
            cursor: isVertical ? 'col-resize' : 'row-resize',
            userSelect: 'none',
          }}
        >
          {/* Line and size readout, drawn by useSplitDrag. */}
          <canvas
            ref={previewRef}
            data-testid="split-handle-preview"
            style={{ position: 'absolute' }}
          />
        </Box>,
        document.body,
      )}
      {inGroup ? (
        <Separator
          id={separatorId}
          disabled
          style={{ flex: `0 0 ${SPLIT_HANDLE_THICKNESS_PX}px`, position: 'relative' }}
        >
          {handle}
        </Separator>
      ) : (
        handle
      )}
    </>
  );
};

export default SplitHandle;
