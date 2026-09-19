// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { SxProps, Theme } from '@mui/material/styles';
import compactStyles from './CompactAutocomplete.module.css';
import { T } from '../../../theme/tokens';

/** MUI Autocomplete root class for data-source pickers (shared height, font, adornments). */
export const compactAutocompleteClassName = compactStyles.compact;

/**
 * Listbox for Autocomplete popper — class is global; see CompactAutocomplete.module.css.
 * Leave the popper portaled (do not set disablePortal). The Data Source card
 * uses overflow:hidden for its radius, and Fields sits below with z-index: 1,
 * so an in-place list is clipped or covered. CSV/SQLite often looked fine
 * only because the UNION picker made the card tall enough for a short list.
 */
export const compactAutocompleteListboxProps = {
  className: 'compactListbox' as const,
};

/** Right-aligned column label aligned to compact control row height (~26px). */
export const sourcePickerFieldLabelSx: SxProps<Theme> = {
  fontWeight: 500,
  fontSize: '0.7rem',
  minWidth: '44px',
  textAlign: 'right',
  paddingRight: '2px',
  color: T.textGhost,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  height: '26px',
  lineHeight: 1,
  flexShrink: 0,
  whiteSpace: 'nowrap',
};
