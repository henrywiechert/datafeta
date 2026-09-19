// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { CSSProperties } from 'react';
import { T } from '../../theme/tokens';

/**
 * Inline styles shared by the axis drop zones (`DropZone`) and the table
 * columns drop zone (`TableColumnsDropZone`).
 *
 * These two components each carried their own copy of this object, identical
 * apart from whitespace and the `flavourSeparator` entry that only the axis
 * zones use. Keeping one copy is what stops the drop-caret colour from drifting
 * between the two zones the next time one of them is edited.
 */
export const DROP_ZONE_STYLES = {
  container: { display: 'flex' } as CSSProperties,

  label: {
    fontWeight: 'normal',
    marginRight: '6px',
    minWidth: '18px',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    color: T.textMuted,
    flexShrink: 0,
  } as CSSProperties,

  dropArea: {
    flex: 1,
    padding: '2px 4px',
    minHeight: '28px',
    display: 'flex',
    alignItems: 'center',
  } as CSSProperties,

  fieldsWrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '2px',
    position: 'relative',
    width: '100%',
  } as CSSProperties,

  /** The insertion caret shown between chips while dragging. */
  dropIndicator: {
    width: '2px',
    height: '24px',
    backgroundColor: T.dropCaret,
    zIndex: 1000,
  } as CSSProperties,

  /** Divider between the discrete and continuous groups on an axis. */
  flavourSeparator: {
    width: '1px',
    height: '16px',
    backgroundColor: T.borderStrong,
    margin: '0 2px',
  } as CSSProperties,

  emptyMessage: {
    color: T.textMuted,
    fontStyle: 'italic',
    fontSize: '12px',
    padding: '1px 0',
  } as CSSProperties,
} as const;
