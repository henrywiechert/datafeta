// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useCallback, useMemo } from 'react';
import { IconButton } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { FieldChipProps } from './types';
import ChipWithTooltip from './ChipWithTooltip';
import FieldContextMenu from './FieldContextMenu';
import ShelfAssignMenu from './ShelfAssignMenu';
import { useSelectionStore, SelectionStore, SelectedField } from '../../../stores/selectionStore';
import { useIsFieldSelected } from '../../../stores/useFieldSelected';
import { useDragHandlers } from './useDragHandlers';
import { useFieldSelection } from './useFieldSelection';
import { FieldMenuConfig, getDefaultFieldMenuConfig } from './fieldMenuConfig';
import { useTabletUi } from '../../../hooks/useTabletUi';
import { useFieldAssign, FieldAssignShelf } from '../../../contexts/FieldAssignContext';

/**
 * FieldChip Component
 *
 * This component displays a field as a draggable chip that can appear in either:
 * 1. The Fields area (left panel) - source: AVAILABLE_FIELDS
 * 2. The Axes drop zones - source: X_AXIS or Y_AXIS
 *
 * Features:
 * - Draggable for drag and drop operations (desktop)
 * - Tap-to-assign shelf menu (tablet, available fields)
 * - Context menu for changing field properties (right-click desktop; button tablet)
 * - Tooltips that only show when text is truncated
 * - Visual styling based on field properties (continuous/discrete)
 * - Automatic truncation detection with ResizeObserver
 * - Multi-select with modifier keys (Ctrl/Cmd, Shift)
 *
 * Performance:
 * - Uses Zustand selectors for granular re-renders
 * - Only re-renders when THIS field's selection status changes
 */
const FieldChip: React.FC<
  FieldChipProps & {
    menuConfig?: FieldMenuConfig;
    onRemoveFromZone?: (fieldIds: string[]) => void;
    displayNameOverride?: string;
  }
> = ({ field, source, onUpdate, index, allFields, menuConfig, onRemoveFromZone, displayNameOverride, onCreateBins, isInvalid }) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [shelfMenuAnchor, setShelfMenuAnchor] = useState<HTMLElement | null>(null);
  const { isTablet } = useTabletUi();
  const fieldAssign = useFieldAssign();
  const isAvailableFields = source === 'AVAILABLE_FIELDS';
  const tabletAssign = isTablet && isAvailableFields && fieldAssign !== null;

  // Granular subscription - only re-renders when THIS field's selection changes
  const isSelected = useIsFieldSelected(field.id, source);

  // Get stable action references (never cause re-renders)
  const getSelectedFieldsForSource = useSelectionStore((s: SelectionStore) => s.getSelectedFieldsForSource);
  const getSelectedCount = useSelectionStore((s: SelectionStore) => s.getSelectedCount);

  // Use custom hooks for cleaner separation of concerns
  const { isDragging, handleDragStart, handleDragEnd } = useDragHandlers({
    field,
    source,
    index,
    allFields,
  });

  const {
    handleMouseDown,
    handleClick,
    handleContextMenu: handleContextMenuSelection
  } = useFieldSelection({
    field,
    source,
    allFields,
  });

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    const position = handleContextMenuSelection(event);
    setMenuPosition(position);
  }, [handleContextMenuSelection]);

  const handleCloseMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  const openContextMenuAt = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const store = useSelectionStore.getState();
    if (!store.isSelected(field.id, source)) {
      store.selectSingle(field.id, source, field);
    }
    setMenuPosition({ x: rect.left, y: rect.bottom });
  }, [field, source]);

  const handleMoreClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt(event.currentTarget);
  }, [openContextMenuAt]);

  const handleChipClick = useCallback((event: React.MouseEvent) => {
    if (tabletAssign) {
      event.preventDefault();
      event.stopPropagation();
      setShelfMenuAnchor(event.currentTarget as HTMLElement);
      return;
    }
    handleClick(event);
  }, [tabletAssign, handleClick]);

  const handleShelfSelect = useCallback((shelf: FieldAssignShelf) => {
    fieldAssign?.assignToShelf(shelf, field, source);
  }, [fieldAssign, field, source]);

  // dragCount computed on demand - only affects this chip when dragging
  const dragCount = isDragging && isSelected ? getSelectedCount() : undefined;

  // selectedFields for context menu - only fetched when menu opens
  const selectedFieldsForMenu = menuPosition
    ? getSelectedFieldsForSource(source).map((sf: SelectedField) => sf.field)
    : [];

  const effectiveMenuConfig = useMemo(
    () => menuConfig ?? getDefaultFieldMenuConfig(source),
    [menuConfig, source]
  );

  // Memoized: ChipWithTooltip's memo compares endAdornment by identity.
  const moreButton = useMemo(() => (isTablet ? (
    <IconButton
      size="small"
      aria-label={`Field options for ${field.columnName}`}
      onClick={handleMoreClick}
      onMouseDown={(e) => e.stopPropagation()}
      sx={{
        flexShrink: 0,
        width: 'var(--df-touch-target)',
        height: 'var(--df-touch-target)',
        ml: 0.25,
      }}
    >
      <MoreVertIcon fontSize="small" />
    </IconButton>
  ) : null), [isTablet, field.columnName, handleMoreClick]);

  return (
    <>
      <ChipWithTooltip
        field={field}
        source={source}
        isDragging={isDragging}
        isSelected={isSelected}
        displayNameOverride={displayNameOverride}
        onClick={handleChipClick}
        onMouseDown={isTablet ? undefined : handleMouseDown}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        dragCount={dragCount}
        draggable={!isTablet}
        endAdornment={moreButton}
        // Flagged upstream by field validation; a zone can override to opt out.
        isInvalid={isInvalid ?? field.isInvalid === true}
      />

      {tabletAssign && (
        <ShelfAssignMenu
          anchorEl={shelfMenuAnchor}
          onClose={() => setShelfMenuAnchor(null)}
          onSelect={handleShelfSelect}
        />
      )}

      <FieldContextMenu
        field={field}
        source={source}
        onUpdate={onUpdate}
        menuPosition={menuPosition}
        onCloseMenu={handleCloseMenu}
        selectedFields={selectedFieldsForMenu}
        menuConfig={effectiveMenuConfig}
        onRemoveFromZone={onRemoveFromZone}
        onCreateBins={onCreateBins}
      />
    </>
  );
};

// Note: Not using React.memo here because the component now uses Zustand selectors
// which provide granular subscriptions. The component only re-renders when
// the selected isSelected value changes for THIS specific field.
export default FieldChip;
