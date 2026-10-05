// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Menu, MenuItem, ListItemText } from '@mui/material';
import { FieldAssignShelf } from '../../../contexts/FieldAssignContext';

export interface ShelfAssignMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (shelf: FieldAssignShelf) => void;
}

const SHELF_OPTIONS: Array<{ shelf: FieldAssignShelf; label: string }> = [
  { shelf: 'x', label: 'X Axis' },
  { shelf: 'y', label: 'Y Axis' },
  { shelf: 'filter', label: 'Filters' },
  { shelf: 'color', label: 'Color' },
  { shelf: 'size', label: 'Size' },
  { shelf: 'shape', label: 'Shape' },
  { shelf: 'lineStyle', label: 'Line style' },
  { shelf: 'label', label: 'Labels' },
  { shelf: 'tooltip', label: 'Tooltip' },
  { shelf: 'background', label: 'Background' },
  { shelf: 'table', label: 'Table columns' },
  { shelf: 'measureGroup', label: 'Measure group' },
];

/**
 * Tap-to-assign menu for tablet mode. Calls the same shelf handlers a drop
 * would use on desktop.
 */
const ShelfAssignMenu: React.FC<ShelfAssignMenuProps> = ({
  anchorEl,
  onClose,
  onSelect,
}) => (
  <Menu
    open={Boolean(anchorEl)}
    anchorEl={anchorEl}
    onClose={onClose}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    MenuListProps={{ 'aria-label': 'Assign field to shelf' }}
  >
    {SHELF_OPTIONS.map(({ shelf, label }) => (
      <MenuItem
        key={shelf}
        onClick={() => {
          onSelect(shelf);
          onClose();
        }}
        sx={{ minHeight: 44 }}
      >
        <ListItemText primary={label} />
      </MenuItem>
    ))}
  </Menu>
);

export default ShelfAssignMenu;
