// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * ShareSnapshotDialog – hands out the link to the open snapshot.
 *
 * A link only ever opens what is stored on the server, so the dialog refuses
 * to hand one out for unsaved work: a touched snapshot has to be saved first,
 * and an untitled workspace has to become a snapshot first. The one exception
 * is a read-only server, where saving is impossible and the link to the saved
 * version is the best that can be offered.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { CurrentSnapshotIdentity } from '../hooks/useCurrentSnapshot';
import { buildSnapshotShareUrl } from './SnapshotGalleryDialog/snapshotGalleryUtils';

interface ShareSnapshotDialogProps {
  open: boolean;
  onClose: () => void;
  /** The open snapshot, or null when the workspace is untitled. */
  snapshot: CurrentSnapshotIdentity | null;
  isDirty: boolean;
  /** Whether the server accepts writes (Save / Save As). */
  canSave: boolean;
  /** ClickHouse `?database=` override to carry into the link. */
  databaseOverride?: string | null;
  /** Save the open snapshot in place. Rejecting keeps the dialog open and shows the error. */
  onSave: () => Promise<void>;
  /** Start naming a new snapshot; the dialog stays open underneath and shows the link once it lands. */
  onSaveAs: () => void;
}

type CopyState = 'idle' | 'copied' | 'manual';

async function copyToClipboard(text: string, input: HTMLInputElement | null): Promise<boolean> {
  // The async Clipboard API only exists in secure contexts (HTTPS or localhost).
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or similar — fall through to the legacy path.
    }
  }
  if (!input) return false;
  input.focus();
  input.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

export default function ShareSnapshotDialog({
  open,
  onClose,
  snapshot,
  isDirty,
  canSave,
  databaseOverride,
  onSave,
  onSaveAs,
}: ShareSnapshotDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setIsSaving(false);
    setError(null);
    setCopyState('idle');
  }, [open]);

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const showLink = snapshot !== null && (!isDirty || !canSave);
  const shareUrl = snapshot ? buildSnapshotShareUrl(snapshot.id, window.location.origin, databaseOverride) : '';
  const shortcutHint = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C';

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl, inputRef.current);
    if (!ok) inputRef.current?.select();
    setCopyState(ok ? 'copied' : 'manual');
  };

  let body: React.ReactNode;
  let primaryAction: React.ReactNode = null;

  if (showLink) {
    body = (
      <>
        {isDirty && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This server is read-only, so your changes can&apos;t be saved. The link opens the last saved version.
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Link"
          value={shareUrl}
          inputRef={inputRef}
          InputProps={{ readOnly: true }}
          onFocus={(e) => e.target.select()}
          helperText={copyState === 'manual' ? `Press ${shortcutHint} to copy` : ' '}
          sx={{ mt: 1, '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
        />
      </>
    );
    primaryAction = (
      <Button
        variant="contained"
        onClick={handleCopy}
        startIcon={copyState === 'copied' ? <CheckIcon /> : <ContentCopyIcon />}
      >
        {copyState === 'copied' ? 'Copied' : 'Copy link'}
      </Button>
    );
  } else if (snapshot && canSave) {
    body = (
      <Typography variant="body2">
        &ldquo;{snapshot.name}&rdquo; has unsaved changes. Save them so the link opens what you see now.
      </Typography>
    );
    primaryAction = (
      <Button
        variant="contained"
        onClick={handleSave}
        disabled={isSaving}
        startIcon={isSaving ? <CircularProgress size={16} /> : undefined}
      >
        Save &amp; share
      </Button>
    );
  } else if (canSave) {
    body = (
      <Typography variant="body2">
        This analysis isn&apos;t saved yet. Save it as a snapshot to get a link you can share.
      </Typography>
    );
    primaryAction = (
      <Button variant="contained" onClick={onSaveAs}>
        Save as snapshot…
      </Button>
    );
  } else {
    body = (
      <Typography variant="body2">
        This analysis isn&apos;t saved as a snapshot, and this server is read-only. Use{' '}
        <strong>File → Export to File…</strong> to share it as a file instead.
      </Typography>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="share-snapshot-title">
      <DialogTitle id="share-snapshot-title">
        {snapshot ? `Share “${snapshot.name}”` : 'Share'}
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {body}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>Close</Button>
        {primaryAction}
      </DialogActions>
    </Dialog>
  );
}
