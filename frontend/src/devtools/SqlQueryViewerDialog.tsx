import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import {
  clearSqlLog,
  formatSql,
  getSqlLogEntries,
  subscribeSqlLog,
  type SqlQueryLogEntry,
} from './queryLogImpl';

type OriginFilter = 'all' | 'remote' | 'local';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export default function SqlQueryViewerDialog(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;

  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formatEnabled, setFormatEnabled] = useState(true);

  // Subscribe to the dev-only store.
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeSqlLog(() => setVersion((v) => v + 1)), []);

  const allEntries = useMemo(() => {
    // Newest first in the list.
    return [...getSqlLogEntries()].reverse();
  }, [version]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (originFilter !== 'all' && e.origin !== originFilter) return false;
      if (!q) return true;
      const hay = `${e.label || ''}\n${e.sql}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allEntries, originFilter, search]);

  const selected: SqlQueryLogEntry | null = useMemo(() => {
    if (!selectedId) return filteredEntries[0] || null;
    return filteredEntries.find((e) => e.id === selectedId) || null;
  }, [filteredEntries, selectedId]);

  useEffect(() => {
    if (!open) return;
    // Ensure something is selected when opening.
    if (!selectedId && filteredEntries.length > 0) {
      setSelectedId(filteredEntries[0].id);
    }
  }, [open, filteredEntries, selectedId]);

  const originChip = (origin: 'remote' | 'local') => {
    return (
      <Chip
        size="small"
        label={origin === 'remote' ? 'REMOTE' : 'LOCAL'}
        color={origin === 'remote' ? 'info' : 'success'}
        variant="filled"
        sx={{ fontWeight: 700, letterSpacing: 0.5 }}
      />
    );
  };

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: best-effort
      // eslint-disable-next-line no-console
      console.warn('Clipboard write failed');
    }
  }, []);

  const sqlToShow = useMemo(() => {
    if (!selected) return '';
    return formatEnabled ? formatSql(selected.sql) : selected.sql;
  }, [selected, formatEnabled]);

  const detailBg = selected?.origin === 'remote' ? 'info.50' : 'success.50';

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1 }}>
            SQL Query Log (dev)
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={originFilter}
            onChange={(_e, v) => v && setOriginFilter(v)}
            size="small"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="remote">Remote</ToggleButton>
            <ToggleButton value="local">Local</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            placeholder="Search SQL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 320 }}
          />
          <ToggleButton
            value="format"
            selected={formatEnabled}
            onChange={() => setFormatEnabled((v) => !v)}
            size="small"
          >
            Format
          </ToggleButton>
          <Button
            startIcon={<DeleteOutlineIcon />}
            variant="outlined"
            color="inherit"
            onClick={() => {
              clearSqlLog();
              setSelectedId(null);
            }}
          >
            Clear
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', height: '100%' }}>
        {/* Left list */}
        <Box sx={{ width: 420, borderRight: '1px solid', borderColor: 'divider', overflow: 'auto' }}>
          <List dense disablePadding>
            {filteredEntries.map((e) => (
              <ListItemButton
                key={e.id}
                selected={selected?.id === e.id}
                onClick={() => setSelectedId(e.id)}
                alignItems="flex-start"
              >
                <Box sx={{ pt: 0.5, pr: 1 }}>{originChip(e.origin)}</Box>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {e.label || '(query)'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {formatTime(e.ts)}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {e.durationMs != null ? `${e.durationMs}ms` : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {e.meta?.row_count != null ? `${e.meta.row_count} rows` : ''}
                      </Typography>
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
            {filteredEntries.length === 0 && (
              <Box sx={{ p: 2, color: 'text.secondary' }}>
                No queries logged yet. Run a query to populate this list.
              </Box>
            )}
          </List>
        </Box>

        {/* Right detail */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'center' }}>
            {selected ? originChip(selected.origin) : null}
            <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 700 }} noWrap>
              {selected?.label || 'SQL'}
            </Typography>
            <Button
              startIcon={<ContentCopyIcon />}
              variant="outlined"
              onClick={() => handleCopy(sqlToShow)}
              disabled={!selected}
            >
              Copy
            </Button>
          </Box>

          <Box sx={{ p: 2, overflow: 'auto', flex: 1, bgcolor: detailBg }}>
            {selected?.meta && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Metadata
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    overflow: 'auto',
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(selected.meta, null, 2)}
                </Box>
                <Divider sx={{ my: 2 }} />
              </>
            )}

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              SQL
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                borderRadius: 1,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'auto',
                fontSize: 13,
                lineHeight: 1.35,
                whiteSpace: 'pre',
              }}
            >
              {sqlToShow}
            </Box>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}


