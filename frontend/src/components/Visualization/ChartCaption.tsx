// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import { marked } from 'marked';
import { useVisualizationContext } from '../../contexts/VisualizationContext';

/**
 * Chart area caption.
 *
 * - Renders markdown content persisted in VisualizationState.chartCaption.
 * - Double-click opens an editor dialog where the user can write multi-line markdown.
 * - Height adapts to content, min ~32px, max 150px with scrollbar.
 */
const ChartCaption: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftText, setDraftText] = useState('');

  const handleDoubleClick = () => {
    setDraftText(state.chartCaption);
    setDialogOpen(true);
  };

  const handleOk = () => {
    dispatch({ type: 'SET_CHART_CAPTION', payload: draftText });
    setDialogOpen(false);
  };

  const handleCancel = () => {
    setDialogOpen(false);
  };

  const renderedHtml = marked.parse(state.chartCaption ?? 'Chart') as string;

  return (
    <>
      <Box
        onDoubleClick={handleDoubleClick}
        title="Double-click to edit caption"
        sx={{
          minHeight: 32,
          maxHeight: 150,
          overflowY: 'auto',
          px: 1.5,
          py: 0.5,
          cursor: 'default',
          userSelect: 'none',
          textAlign: 'left',
          fontSize: '0.68rem',
          borderRadius: 1,
          transition: 'background-color 0.15s',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          // Markdown content styling
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            margin: '2px 0',
            lineHeight: 1.3,
          },
          '& p': {
            margin: '2px 0',
          },
          '& ul, & ol': {
            margin: '2px 0',
            marginLeft: 1,
            paddingLeft: '1.1em',
            paddingInlineStart: '1.1em',
          },
          '& ul ul, & ul ol, & ol ul, & ol ol': {
            margin: 0,
            paddingLeft: '1em',
            paddingInlineStart: '1em',
          },
          '& li': {
            margin: 0,
          },
          '& code': {
            fontFamily: 'monospace',
            backgroundColor: 'action.hover',
            borderRadius: '3px',
            padding: '1px 3px',
            fontSize: '1em',
          },
          '& pre': {
            backgroundColor: 'action.hover',
            borderRadius: '4px',
            padding: '6px 8px',
            overflowX: 'auto',
          },
          '& a': {
            color: 'primary.main',
          },
          '& strong': {
            fontWeight: 'bold',
          },
          '& em': {
            fontStyle: 'italic',
          },
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />

      <Dialog
        open={dialogOpen}
        onClose={handleCancel}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Edit Caption (Markdown format)</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            multiline
            minRows={4}
            maxRows={12}
            fullWidth
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Enter markdown text…"
            variant="outlined"
            size="small"
            sx={{ mt: 0.5 }}
            onKeyDown={(e) => {
              // Ctrl+Enter or Cmd+Enter confirms
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleOk();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancel} size="small">Cancel</Button>
          <Button onClick={handleOk} variant="contained" size="small">Ok</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ChartCaption;
