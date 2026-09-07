// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * SnapshotSaveAsDialog – names a new server snapshot and picks its folder.
 *
 * Used both by the "Save As..." menu action and by the snapshot gallery, so
 * there is a single place where a new configuration gets named.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { apiService } from '../apiService';
import {
  buildSnapshotTree,
  collectAllFolderPaths,
} from './SnapshotGalleryDialog/snapshotGalleryUtils';

interface SnapshotSaveAsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Persist the snapshot. Rejecting keeps the dialog open and shows the error. */
  onSave: (name: string, folder: string) => Promise<void>;
  initialName?: string;
  initialFolder?: string;
}

export default function SnapshotSaveAsDialog({
  open,
  onClose,
  onSave,
  initialName = '',
  initialFolder = '',
}: SnapshotSaveAsDialogProps) {
  const [name, setName] = useState(initialName);
  const [folder, setFolder] = useState(initialFolder);
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the caller's defaults and refresh folder options each time the
  // dialog opens — folders may have changed since it was last shown.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setFolder(initialFolder);
    setError(null);
    setIsSaving(false);

    let cancelled = false;
    (async () => {
      try {
        const snapshots = await apiService.listSnapshots();
        if (!cancelled) {
          setFolderOptions(collectAllFolderPaths(buildSnapshotTree(snapshots)));
        }
      } catch {
        // Folder suggestions are a convenience; the free-text field still works.
        if (!cancelled) setFolderOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, initialName, initialFolder]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(trimmedName, folder.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="snapshot-save-as-title"
    >
      <DialogTitle id="snapshot-save-as-title">Save Configuration As</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        <TextField
          autoFocus
          margin="dense"
          label="Name"
          fullWidth
          placeholder="Enter snapshot name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          disabled={isSaving}
          sx={{ mt: 1, mb: 2 }}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={folderOptions}
          value={folder}
          disabled={isSaving}
          onChange={(_e, newValue) => setFolder(newValue ?? '')}
          onInputChange={(_e, newInput) => setFolder(newInput)}
          renderInput={(params) => (
            <TextField {...params} label="Folder" placeholder="Root (no folder)" />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
