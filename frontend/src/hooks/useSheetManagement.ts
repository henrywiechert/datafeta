// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useCallback } from 'react';
import { Sheet } from '../types';

/** Context needed by the sheet management hook. */
export interface SheetManagementOptions {
  /** Sheet CRUD operations from SheetContext. */
  addSheet: () => void;
  renameSheet: (sheetId: string, name: string) => void;
  duplicateSheet: (sheetId: string) => void;
  removeSheet: (sheetId: string) => void;
  setActiveSheet: (sheetId: string) => void;
  sheets: Sheet[];

  /** Router primitives for tab-based navigation. */
  navigate: (to: string) => void;
  isVisualizationPage: boolean;
}

/** Internal state for the context menu. */
export interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  sheetId: string;
}

/** Internal state for the rename dialog. */
export interface RenameDialogState {
  open: boolean;
  sheetId: string;
  currentName: string;
}

/** Return value of useSheetManagement. */
export interface UseSheetManagementReturn {
  // --- Context menu state ---
  contextMenu: ContextMenuState | null;
  closeContextMenu: () => void;

  // --- Rename dialog state ---
  renameDialog: RenameDialogState;
  newName: string;
  setNewName: (name: string) => void;
  closeRenameDialog: () => void;

  // --- Handlers ---
  /** Open the context menu at absolute coordinates. Used by JSX for keyboard shortcuts. */
  openSheetMenu: (sheetId: string, mouseX: number, mouseY: number) => void;
  /** Switch tab (datasources or sheet) and navigate if needed. */
  handleTabChange: (event: React.SyntheticEvent, sheetIdOrDatasources: string) => void;
  /** Create a new sheet and navigate to visualization page. */
  handleAddSheet: (event: React.MouseEvent) => void;
  /** Open the context menu for a sheet. */
  handleContextMenu: (event: React.MouseEvent, sheetId: string) => void;
  /** Open the rename dialog from the context menu. */
  handleRenameClick: () => void;
  /** Confirm the rename operation. */
  handleRenameConfirm: () => void;
  /** Duplicate the context-menu sheet. */
  handleDuplicateClick: () => void;
  /** Delete the context-menu sheet (protected: last sheet). */
  handleDeleteClick: () => void;
}

/**
 * Encapsulates all sheet-management state and handlers that were
 * previously inline in App.tsx's AppContent component.
 *
 * Extracted responsibilities:
 * - Context menu (open, close)
 * - Rename dialog (open, confirm, close)
 * - Tab switching (datasources vs sheet)
 * - Sheet CRUD actions (add, duplicate, delete)
 */
export function useSheetManagement(
  options: SheetManagementOptions,
): UseSheetManagementReturn {
  const {
    addSheet,
    renameSheet,
    duplicateSheet,
    removeSheet,
    setActiveSheet,
    sheets,
    navigate,
    isVisualizationPage,
  } = options;

  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openSheetMenu = useCallback(
    (sheetId: string, mouseX: number, mouseY: number) => {
      setContextMenu({ mouseX, mouseY, sheetId });
    },
    [],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, sheetId: string) => {
      event.preventDefault();
      event.stopPropagation();
      openSheetMenu(sheetId, event.clientX - 2, event.clientY - 4);
    },
    [openSheetMenu],
  );

  // --- Rename dialog state ---
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
    open: false,
    sheetId: '',
    currentName: '',
  });

  const [newName, setNewName] = useState('');

  const closeRenameDialog = useCallback(() => {
    setRenameDialog({ open: false, sheetId: '', currentName: '' });
    setNewName('');
  }, []);

  const handleRenameClick = useCallback(() => {
    if (!contextMenu) return;
    const sheet = sheets.find((s) => s.id === contextMenu.sheetId);
    if (sheet) {
      setNewName(sheet.name);
      setRenameDialog({
        open: true,
        sheetId: contextMenu.sheetId,
        currentName: sheet.name,
      });
    }
    closeContextMenu();
  }, [contextMenu, sheets, closeContextMenu]);

  const handleRenameConfirm = useCallback(() => {
    if (newName.trim() && renameDialog.sheetId) {
      renameSheet(renameDialog.sheetId, newName.trim());
    }
    closeRenameDialog();
  }, [newName, renameDialog.sheetId, renameSheet, closeRenameDialog]);

  const handleDuplicateClick = useCallback(() => {
    if (contextMenu) {
      duplicateSheet(contextMenu.sheetId);
    }
    closeContextMenu();
  }, [contextMenu, duplicateSheet, closeContextMenu]);

  const handleDeleteClick = useCallback(() => {
    if (contextMenu && sheets.length > 1) {
      removeSheet(contextMenu.sheetId);
    }
    closeContextMenu();
  }, [contextMenu, sheets.length, removeSheet, closeContextMenu]);

  // --- Tab switching ---
  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string) => {
      if (newValue === 'datasources') {
        navigate('/');
      } else {
        setActiveSheet(newValue);
        if (!isVisualizationPage) {
          navigate('/visualize');
        }
      }
    },
    [navigate, setActiveSheet, isVisualizationPage],
  );

  const handleAddSheet = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      addSheet();
      if (!isVisualizationPage) {
        navigate('/visualize');
      }
    },
    [addSheet, isVisualizationPage, navigate],
  );

  return {
    contextMenu,
    openSheetMenu,
    closeContextMenu,
    renameDialog,
    newName,
    setNewName,
    closeRenameDialog,
    handleTabChange,
    handleAddSheet,
    handleContextMenu,
    handleRenameClick,
    handleRenameConfirm,
    handleDuplicateClick,
    handleDeleteClick,
  };
}
