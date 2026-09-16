// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { T } from '../../theme/tokens';

/**
 * Layout chrome tokens — the single source of truth for how every split,
 * divider and collapsed rail in the app looks and behaves.
 *
 * Before these existed, each resizable boundary had its own numbers: a 6px
 * shell handle with a 1px grey line, an invisible 8px legend handle, and a 2px
 * green handle on the chart gridlines. Anything that draws a resize boundary
 * should read from here rather than hardcoding values, so the app keeps one
 * resize vocabulary.
 *
 * Values come in two flavours because there are two styling systems in play:
 * `*_COLOR` constants are MUI `sx` palette keys, resolved by `sx`; `*_CSS`
 * constants are `var()` strings from the `--df-*` token layer, for the
 * consumers that write raw inline styles or CSS (e.g. the chart gridline
 * handles). Both follow the color scheme, so neither needs revisiting when a
 * dark theme lands. See src/theme/THEMING.md.
 */

/**
 * Width of a split handle: both its layout footprint and its pointer target.
 *
 * Kept deliberately narrow — this is the gap the user sees between panels. The
 * handle stays grabbable at this width because the line it draws is thinner
 * still, so the whole handle is slack around a 1px target.
 */
export const SPLIT_HANDLE_THICKNESS_PX = 4;

/** The always-visible divider line inside a split handle. */
export const SPLIT_LINE_THICKNESS_PX = 1;

/** The same line while hovered or dragging. */
export const SPLIT_LINE_ACTIVE_THICKNESS_PX = 2;

/** Width of the strip a collapsed panel leaves behind. */
export const COLLAPSE_RAIL_THICKNESS_PX = 28;

/** Arrow-key resize step. Home/End jump to the panel's min/max instead. */
export const SPLIT_KEYBOARD_STEP_PX = 8;

/** Divider line at rest. */
export const SPLIT_LINE_COLOR = 'divider';

/** Divider line while hovered or dragging, and the drag preview line. */
export const SPLIT_LINE_ACTIVE_COLOR = 'primary.main';

/** Backdrop tint on the handle's pointer target while hovered. */
export const SPLIT_HOVER_BACKDROP_COLOR = 'action.hover';

/**
 * Chart gridline resize handles style themselves with raw inline styles, so
 * they take `var()` strings rather than `sx` palette keys. Same blue as every
 * other handle: these used to be a one-off green.
 */
export const SPLIT_LINE_ACTIVE_CSS = T.chartResizeHandle;
export const SPLIT_LINE_DRAGGING_CSS = T.chartResizeHandleHover;

/**
 * Surface of a secondary panel (Properties) and of a collapsed rail, so a
 * collapsed panel reads as the same material as an expanded one.
 */
export const PANEL_SURFACE = T.surfacePanel;

/** Branded panel header (app title / help row above the Fields panel). */
export const PANEL_HEADER_SURFACE = T.surfaceHeader;

/** Drag preview line floats above panels and dialogs but below modals. */
export const SPLIT_PREVIEW_Z_INDEX = 1400;
