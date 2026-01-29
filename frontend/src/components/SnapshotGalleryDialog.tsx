import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import { SnapshotMetadata, SavedConfiguration } from '../types';
import { apiService } from '../apiService';

interface SnapshotGalleryDialogProps {
  open: boolean;
  onClose: () => void;
  onLoad: (configuration: SavedConfiguration, snapshotId?: string) => void;
  getCurrentConfiguration: () => SavedConfiguration;
}

export default function SnapshotGalleryDialog({
  open,
  onClose,
  onLoad,
  getCurrentConfiguration,
}: SnapshotGalleryDialogProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Save new snapshot state
  const [newSnapshotName, setNewSnapshotName] = useState('');
  
  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Overwrite confirmation
  const [overwritingId, setOverwritingId] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await apiService.listSnapshots();
      setSnapshots(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshots');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadSnapshots();
      setNewSnapshotName('');
      setEditingId(null);
      setDeletingId(null);
      setOverwritingId(null);
      setSuccessMessage(null);
    }
  }, [open, loadSnapshots]);

  const handleSaveNew = async () => {
    if (!newSnapshotName.trim()) {
      setError('Please enter a name for the snapshot');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const configuration = getCurrentConfiguration();
      await apiService.saveSnapshot(newSnapshotName.trim(), configuration);
      setNewSnapshotName('');
      setSuccessMessage('Snapshot saved successfully');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save snapshot');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async (snapshotId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const snapshot = await apiService.loadSnapshot(snapshotId);
      onLoad(snapshot.configuration as SavedConfiguration, snapshotId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshot');
      setIsLoading(false);
    }
  };

  const handleCopyLink = async (snapshotId: string) => {
    try {
      const url = new URL(window.location.href);
      url.search = ''; // Clear existing params
      url.searchParams.set('snapshot', snapshotId);
      await navigator.clipboard.writeText(url.toString());
      setSuccessMessage('Link copied to clipboard');
    } catch (err) {
      // Fallback for browsers without clipboard API
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('snapshot', snapshotId);
      setSuccessMessage(`Link: ${url.toString()}`);
    }
  };

  const handleDelete = async (snapshotId: string) => {
    setError(null);
    setSuccessMessage(null);

    try {
      await apiService.deleteSnapshot(snapshotId);
      setDeletingId(null);
      setSuccessMessage('Snapshot deleted');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete snapshot');
    }
  };

  const handleOverwrite = async (snapshotId: string) => {
    setError(null);
    setSuccessMessage(null);

    try {
      const configuration = getCurrentConfiguration();
      await apiService.overwriteSnapshot(snapshotId, configuration);
      setOverwritingId(null);
      setSuccessMessage('Snapshot updated');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update snapshot');
    }
  };

  const handleStartRename = (snapshot: SnapshotMetadata) => {
    setEditingId(snapshot.id);
    setEditingName(snapshot.name);
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveRename = async () => {
    if (!editingId || !editingName.trim()) return;

    setError(null);
    setSuccessMessage(null);

    try {
      await apiService.renameSnapshot(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
      setSuccessMessage('Snapshot renamed');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename snapshot');
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Saved Configurations</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {/* Save New Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Save Current Configuration
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Enter snapshot name..."
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isSaving) {
                    handleSaveNew();
                  }
                }}
                disabled={isSaving}
                InputProps={{
                  endAdornment: isSaving ? (
                    <InputAdornment position="end">
                      <CircularProgress size={20} />
                    </InputAdornment>
                  ) : null,
                }}
              />
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveNew}
                disabled={isSaving || !newSnapshotName.trim()}
              >
                Save
              </Button>
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Error/Success Messages */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
              {successMessage}
            </Alert>
          )}

          {/* Snapshots List */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Saved Snapshots
          </Typography>

          {isLoading && snapshots.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : snapshots.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No saved snapshots yet. Save your first configuration above.
            </Typography>
          ) : (
            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {snapshots.map((snapshot) => (
                <ListItem
                  key={snapshot.id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {editingId === snapshot.id ? (
                    // Rename mode
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                      <TextField
                        size="small"
                        fullWidth
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleSaveRename();
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        autoFocus
                      />
                      <IconButton size="small" onClick={handleSaveRename} color="primary">
                        <CheckIcon />
                      </IconButton>
                      <IconButton size="small" onClick={handleCancelRename}>
                        <CloseIcon />
                      </IconButton>
                    </Box>
                  ) : deletingId === snapshot.id ? (
                    // Delete confirmation mode
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        Delete "{snapshot.name}"?
                      </Typography>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleDelete(snapshot.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </Box>
                  ) : overwritingId === snapshot.id ? (
                    // Overwrite confirmation mode
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        Overwrite "{snapshot.name}" with current config?
                      </Typography>
                      <Button
                        size="small"
                        color="primary"
                        variant="contained"
                        onClick={() => handleOverwrite(snapshot.id)}
                      >
                        Overwrite
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setOverwritingId(null)}
                      >
                        Cancel
                      </Button>
                    </Box>
                  ) : (
                    // Normal display mode
                    <>
                      <ListItemText
                        primary={snapshot.name}
                        secondary={`Last updated: ${formatDate(snapshot.updatedAt)}`}
                        sx={{ pr: 2 }}
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title="Load">
                          <IconButton
                            edge="end"
                            onClick={() => handleLoad(snapshot.id)}
                            color="primary"
                          >
                            <FolderOpenIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy shareable link">
                          <IconButton
                            edge="end"
                            onClick={() => handleCopyLink(snapshot.id)}
                            sx={{ ml: 1 }}
                          >
                            <LinkIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Overwrite with current">
                          <IconButton
                            edge="end"
                            onClick={() => setOverwritingId(snapshot.id)}
                            sx={{ ml: 1 }}
                            color="secondary"
                          >
                            <SaveAsIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Rename">
                          <IconButton
                            edge="end"
                            onClick={() => handleStartRename(snapshot)}
                            sx={{ ml: 1 }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            edge="end"
                            onClick={() => setDeletingId(snapshot.id)}
                            sx={{ ml: 1 }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </>
                  )}
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
