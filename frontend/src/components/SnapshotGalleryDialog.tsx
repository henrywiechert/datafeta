import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ListItemButton,
  ListItemIcon,
  IconButton,
  Divider,
  Tooltip,
  InputAdornment,
  Collapse,
  MenuItem,
  Menu,
  Autocomplete,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderIcon from '@mui/icons-material/Folder';
import SaveIcon from '@mui/icons-material/Save';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import { SnapshotMetadata, SavedConfiguration } from '../types';
import { apiService } from '../apiService';

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  snapshots: SnapshotMetadata[];
}

function buildTree(snapshots: SnapshotMetadata[]): FolderNode {
  const root: FolderNode = { name: '', path: '', children: [], snapshots: [] };

  for (const snap of snapshots) {
    const folder = snap.folder || '';
    if (!folder) {
      root.snapshots.push(snap);
      continue;
    }
    const segments = folder.split('/');
    let node = root;
    let pathSoFar = '';
    for (const seg of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
      let child = node.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, path: pathSoFar, children: [], snapshots: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.snapshots.push(snap);
  }

  const sortNode = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

function collectAllFolderPaths(node: FolderNode): string[] {
  const paths: string[] = [];
  const walk = (n: FolderNode) => {
    if (n.path) paths.push(n.path);
    n.children.forEach(walk);
  };
  walk(node);
  return paths.sort();
}

function isFolderEmpty(node: FolderNode): boolean {
  return node.snapshots.length === 0 && node.children.every(isFolderEmpty);
}

// ---------------------------------------------------------------------------
// Search highlight helper
// ---------------------------------------------------------------------------

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <Box component="span" sx={{ bgcolor: 'action.selected', borderRadius: 0.5, px: 0.25 }}>
        {text.slice(idx, idx + query.length)}
      </Box>
      {text.slice(idx + query.length)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  // Save new snapshot
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [saveFolder, setSaveFolder] = useState('');

  // Rename snapshot
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Delete / overwrite confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [overwritingId, setOverwritingId] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Folder tree expand state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Folder rename
  const [renamingFolderPath, setRenamingFolderPath] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState('');

  // Move snapshot
  const [moveAnchorEl, setMoveAnchorEl] = useState<null | HTMLElement>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveNewFolderInput, setMoveNewFolderInput] = useState<string | null>(null);

  // Inline "new folder" creation
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // ---- Derived data ----

  const filteredSnapshots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return snapshots;
    return snapshots.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.folder && s.folder.toLowerCase().includes(q))
    );
  }, [snapshots, searchQuery]);

  const tree = useMemo(() => buildTree(filteredSnapshots), [filteredSnapshots]);
  const allFolderPaths = useMemo(() => collectAllFolderPaths(buildTree(snapshots)), [snapshots]);
  const isSearching = searchQuery.trim().length > 0;

  // ---- Data loading ----

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
      setSaveFolder('');
      setEditingId(null);
      setDeletingId(null);
      setOverwritingId(null);
      setSuccessMessage(null);
      setSearchQuery('');
      setRenamingFolderPath(null);
      setMovingId(null);
      setMoveAnchorEl(null);
      setMoveNewFolderInput(null);
      setCreatingFolder(false);
      setNewFolderName('');
    }
  }, [open, loadSnapshots]);

  // ---- Handlers ----

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
      await apiService.saveSnapshot(newSnapshotName.trim(), configuration, saveFolder || undefined);
      setNewSnapshotName('');
      setSuccessMessage('Snapshot saved successfully');
      if (saveFolder) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          const parts = saveFolder.split('/');
          let p = '';
          for (const seg of parts) {
            p = p ? `${p}/${seg}` : seg;
            next.add(p);
          }
          return next;
        });
      }
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

  const handleCopyLink = (snapshotId: string) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('snapshot', snapshotId);
    const linkText = url.toString();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(linkText).then(
        () => setSuccessMessage('Link copied to clipboard'),
        () => fallbackCopyToClipboard(linkText),
      );
    } else {
      fallbackCopyToClipboard(linkText);
    }
  };

  const fallbackCopyToClipboard = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy')
        ? setSuccessMessage('Link copied to clipboard')
        : setSuccessMessage(`Link: ${text}`);
    } catch {
      setSuccessMessage(`Link: ${text}`);
    }
    document.body.removeChild(textArea);
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
  const handleCancelRename = () => { setEditingId(null); setEditingName(''); };
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

  // ---- Folder handlers ----

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const handleStartFolderRename = (folderPath: string) => {
    const segments = folderPath.split('/');
    setRenamingFolderPath(folderPath);
    setRenamingFolderName(segments[segments.length - 1]);
  };

  const handleCancelFolderRename = () => {
    setRenamingFolderPath(null);
    setRenamingFolderName('');
  };

  const handleSaveFolderRename = async () => {
    if (!renamingFolderPath || !renamingFolderName.trim()) return;
    setError(null);
    setSuccessMessage(null);
    const segments = renamingFolderPath.split('/');
    segments[segments.length - 1] = renamingFolderName.trim();
    const newPath = segments.join('/');
    if (newPath === renamingFolderPath) {
      handleCancelFolderRename();
      return;
    }
    try {
      await apiService.renameFolder(renamingFolderPath, newPath);
      setExpandedFolders((prev) => {
        const next = new Set<string>();
        Array.from(prev).forEach((p) => {
          if (p === renamingFolderPath || p.startsWith(renamingFolderPath + '/')) {
            next.add(newPath + p.slice(renamingFolderPath.length));
          } else {
            next.add(p);
          }
        });
        return next;
      });
      setRenamingFolderPath(null);
      setRenamingFolderName('');
      setSuccessMessage('Folder renamed');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folderPath: string) => {
    setError(null);
    setSuccessMessage(null);
    const inFolder = snapshots.filter(
      (s) => s.folder === folderPath || s.folder.startsWith(folderPath + '/')
    );
    for (const snap of inFolder) {
      try { await apiService.deleteSnapshot(snap.id); } catch { /* continue */ }
    }
    setSuccessMessage(`Deleted folder and ${inFolder.length} snapshot(s)`);
    await loadSnapshots();
  };

  // ---- New folder handler ----

  const handleConfirmNewFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    setSaveFolder(name);
    setCreatingFolder(false);
    setNewFolderName('');
    setSuccessMessage(`Folder "${name}" selected — save a snapshot to create it`);
  };

  // ---- Move handlers ----

  const handleOpenMove = (event: React.MouseEvent<HTMLElement>, snapshotId: string) => {
    setMoveAnchorEl(event.currentTarget);
    setMovingId(snapshotId);
  };

  const handleCloseMove = () => {
    setMoveAnchorEl(null);
    setMovingId(null);
    setMoveNewFolderInput(null);
  };

  const handleMoveToFolder = async (folder: string) => {
    if (!movingId) return;
    setError(null);
    setSuccessMessage(null);
    try {
      await apiService.moveSnapshot(movingId, folder);
      setSuccessMessage('Snapshot moved');
      if (folder) {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          const parts = folder.split('/');
          let p = '';
          for (const seg of parts) {
            p = p ? `${p}/${seg}` : seg;
            next.add(p);
          }
          return next;
        });
      }
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move snapshot');
    } finally {
      handleCloseMove();
    }
  };

  const formatDate = (isoString: string) => {
    try { return new Date(isoString).toLocaleString(); } catch { return isoString; }
  };

  // ---- Render helpers ----

  const renderSnapshotItem = (snapshot: SnapshotMetadata, depth: number, showFolder?: boolean) => (
    <ListItem
      key={snapshot.id}
      sx={{
        pl: depth * 3,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        mb: 0.5,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {editingId === snapshot.id ? (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename();
              if (e.key === 'Escape') handleCancelRename();
            }}
            autoFocus
          />
          <IconButton size="small" onClick={handleSaveRename} color="primary"><CheckIcon /></IconButton>
          <IconButton size="small" onClick={handleCancelRename}><CloseIcon /></IconButton>
        </Box>
      ) : deletingId === snapshot.id ? (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>Delete &ldquo;{snapshot.name}&rdquo;?</Typography>
          <Button size="small" color="error" onClick={() => handleDelete(snapshot.id)}>Delete</Button>
          <Button size="small" onClick={() => setDeletingId(null)}>Cancel</Button>
        </Box>
      ) : overwritingId === snapshot.id ? (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>Overwrite &ldquo;{snapshot.name}&rdquo; with current config?</Typography>
          <Button size="small" color="primary" variant="contained" onClick={() => handleOverwrite(snapshot.id)}>Overwrite</Button>
          <Button size="small" onClick={() => setOverwritingId(null)}>Cancel</Button>
        </Box>
      ) : (
        <>
          <ListItemText
            primary={isSearching ? highlightMatch(snapshot.name, searchQuery.trim()) : snapshot.name}
            secondary={
              showFolder
                ? `${snapshot.folder || 'Root'} · ${formatDate(snapshot.updatedAt)}`
                : `Last updated: ${formatDate(snapshot.updatedAt)}`
            }
            sx={{ pr: 2 }}
          />
          <ListItemSecondaryAction>
            <Tooltip title="Load">
              <IconButton edge="end" onClick={() => handleLoad(snapshot.id)} color="primary"><FolderOpenIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Copy shareable link">
              <IconButton edge="end" onClick={() => handleCopyLink(snapshot.id)} sx={{ ml: 0.5 }}><LinkIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Move to folder">
              <IconButton edge="end" onClick={(e) => handleOpenMove(e, snapshot.id)} sx={{ ml: 0.5 }}><DriveFileMoveIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Overwrite with current">
              <IconButton edge="end" onClick={() => setOverwritingId(snapshot.id)} sx={{ ml: 0.5 }} color="secondary"><SaveAsIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Rename">
              <IconButton edge="end" onClick={() => handleStartRename(snapshot)} sx={{ ml: 0.5 }}><EditIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton edge="end" onClick={() => setDeletingId(snapshot.id)} sx={{ ml: 0.5 }}><DeleteIcon /></IconButton>
            </Tooltip>
          </ListItemSecondaryAction>
        </>
      )}
    </ListItem>
  );

  const renderFolderNode = (node: FolderNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.path);
    const isRenaming = renamingFolderPath === node.path;
    const empty = isFolderEmpty(node);
    const snapshotCount = snapshots.filter(
      (s) => s.folder === node.path || s.folder.startsWith(node.path + '/')
    ).length;

    return (
      <React.Fragment key={node.path}>
        {isRenaming ? (
          <ListItem sx={{ pl: depth * 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
              <FolderIcon color="action" sx={{ mr: 0.5 }} />
              <TextField
                size="small"
                fullWidth
                value={renamingFolderName}
                onChange={(e) => setRenamingFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveFolderRename();
                  if (e.key === 'Escape') handleCancelFolderRename();
                }}
                autoFocus
              />
              <IconButton size="small" onClick={handleSaveFolderRename} color="primary"><CheckIcon /></IconButton>
              <IconButton size="small" onClick={handleCancelFolderRename}><CloseIcon /></IconButton>
            </Box>
          </ListItem>
        ) : (
          <ListItemButton
            onClick={() => toggleFolder(node.path)}
            sx={{ pl: depth * 3, py: 0.5, borderRadius: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </ListItemIcon>
            <FolderIcon color="action" sx={{ mr: 1, fontSize: 20 }} />
            <ListItemText
              primary={node.name}
              secondary={`${snapshotCount} snapshot${snapshotCount !== 1 ? 's' : ''}`}
              primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
            <Tooltip title="Rename folder">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); handleStartFolderRename(node.path); }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {empty && (
              <Tooltip title="Delete empty folder">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(node.path); }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </ListItemButton>
        )}

        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          {node.children.map((child) => renderFolderNode(child, depth + 1))}
          {node.snapshots.map((snap) => renderSnapshotItem(snap, depth + 1))}
          {isExpanded && node.children.length === 0 && node.snapshots.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ pl: (depth + 1) * 3 + 2, py: 0.5, display: 'block' }}>
              (empty)
            </Typography>
          )}
        </Collapse>
      </React.Fragment>
    );
  };

  // ---- Main render ----

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Saved Configurations</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {/* Save New Section */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Save Current Configuration</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Enter snapshot name..."
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isSaving) handleSaveNew(); }}
                disabled={isSaving}
                InputProps={{
                  endAdornment: isSaving ? (
                    <InputAdornment position="end"><CircularProgress size={20} /></InputAdornment>
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
            <Autocomplete
              freeSolo
              size="small"
              options={allFolderPaths}
              value={saveFolder}
              onChange={(_e, newValue) => setSaveFolder(newValue ?? '')}
              onInputChange={(_e, newInput) => setSaveFolder(newInput)}
              renderInput={(params) => (
                <TextField {...params} label="Save into folder" placeholder="Root (no folder)" />
              )}
            />
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Error/Success Messages */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
          )}
          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>{successMessage}</Alert>
          )}

          {/* Snapshots List Header + Search + New Folder */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>Saved Snapshots</Typography>
            <Tooltip title="New folder">
              <IconButton size="small" onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}>
                <CreateNewFolderIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {snapshots.length > 0 && (
              <TextField
                size="small"
                fullWidth
                placeholder="Search snapshots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start"><SearchIcon fontSize="small" color="action" /></InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchQuery('')} edge="end"><ClearIcon fontSize="small" /></IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
            )}
          </Box>

          {/* Inline new folder input */}
          {creatingFolder && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <FolderIcon color="action" sx={{ fontSize: 20 }} />
              <TextField
                size="small"
                fullWidth
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmNewFolder();
                  if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                }}
                autoFocus
              />
              <IconButton size="small" color="primary" onClick={handleConfirmNewFolder} disabled={!newFolderName.trim()}>
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          {/* Content */}
          {isLoading && snapshots.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : snapshots.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No saved snapshots yet. Save your first configuration above.
            </Typography>
          ) : filteredSnapshots.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No snapshots matching &ldquo;{searchQuery}&rdquo;
            </Typography>
          ) : isSearching ? (
            // Flat search results
            <List dense sx={{ maxHeight: 350, overflow: 'auto' }}>
              {filteredSnapshots.map((snap) => renderSnapshotItem(snap, 0, true))}
            </List>
          ) : (
            // Tree view
            <List dense sx={{ maxHeight: 350, overflow: 'auto' }}>
              {tree.children.map((child) => renderFolderNode(child, 0))}
              {tree.snapshots.map((snap) => renderSnapshotItem(snap, 0))}
            </List>
          )}
        </Box>

        {/* Move-to-folder menu */}
        <Menu
          anchorEl={moveAnchorEl}
          open={Boolean(moveAnchorEl)}
          onClose={handleCloseMove}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <MenuItem onClick={() => handleMoveToFolder('')}>
            <em>Root (no folder)</em>
          </MenuItem>
          {allFolderPaths.map((fp) => (
            <MenuItem key={fp} onClick={() => handleMoveToFolder(fp)}>{fp}</MenuItem>
          ))}
          <Divider />
          {moveNewFolderInput !== null ? (
            <Box sx={{ px: 2, py: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Folder name..."
                value={moveNewFolderInput}
                onChange={(e) => setMoveNewFolderInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && moveNewFolderInput.trim()) {
                    handleMoveToFolder(moveNewFolderInput.trim());
                  }
                  if (e.key === 'Escape') setMoveNewFolderInput(null);
                }}
                autoFocus
                sx={{ minWidth: 160 }}
              />
              <IconButton
                size="small"
                color="primary"
                disabled={!moveNewFolderInput.trim()}
                onClick={() => handleMoveToFolder(moveNewFolderInput.trim())}
              >
                <CheckIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <MenuItem onClick={() => setMoveNewFolderInput('')}>
              <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
              New folder...
            </MenuItem>
          )}
        </Menu>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
