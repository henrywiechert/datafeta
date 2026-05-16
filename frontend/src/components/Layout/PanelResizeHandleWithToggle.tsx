// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { PanelResizeHandle } from 'react-resizable-panels';
import { Box } from '@mui/material';

interface PanelResizeHandleWithToggleProps {
  onDoubleClick: () => void;
  id?: string;
}

/**
 * A custom resize handle that supports double-click to toggle panel visibility.
 * Styled as a thin vertical bar that highlights on hover.
 */
const PanelResizeHandleWithToggle: React.FC<PanelResizeHandleWithToggleProps> = ({
  onDoubleClick,
  id,
}) => {
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDoubleClick();
  }, [onDoubleClick]);

  return (
    <PanelResizeHandle id={id}>
      <Box
        onDoubleClick={handleDoubleClick}
        sx={{
          width: 6,
          height: '100%',
          backgroundColor: 'transparent',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.15s',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          '&:active': {
            backgroundColor: 'primary.light',
          },
          // Visual indicator line in the center
          '&::after': {
            content: '""',
            width: 2,
            height: 24,
            backgroundColor: 'divider',
            borderRadius: 1,
            transition: 'background-color 0.15s',
          },
          '&:hover::after': {
            backgroundColor: 'primary.main',
          },
        }}
      />
    </PanelResizeHandle>
  );
};

export default PanelResizeHandleWithToggle;
