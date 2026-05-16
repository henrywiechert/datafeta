// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, Suspense } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';

const SqlQueryViewerDialog = React.lazy(() => import('./SqlQueryViewerDialog'));

export default function DevSqlViewerControl() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="SQL Viewer (dev)">
        <IconButton
          onClick={() => setOpen(true)}
          size="small"
          color="default"
          sx={{
            '&:hover': { backgroundColor: 'action.hover' },
          }}
        >
          <TerminalIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {open && (
        <Suspense fallback={null}>
          <SqlQueryViewerDialog open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}


