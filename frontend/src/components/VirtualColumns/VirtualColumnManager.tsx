// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { VirtualColumnDefinition } from '../../types';
import VirtualColumnEditor from './VirtualColumnEditor';
import styles from '../Visualization/FieldsPanel/FieldsPanel.module.css';

interface VirtualColumnManagerProps {
  virtualColumns: VirtualColumnDefinition[];
  availableColumns: string[];
  onAdd: (column: VirtualColumnDefinition) => void;
  onEdit: (index: number, column: VirtualColumnDefinition) => void;
  onDelete: (index: number) => void;
}

const VirtualColumnManager: React.FC<VirtualColumnManagerProps> = ({
  virtualColumns,
  availableColumns,
  onAdd,
  onEdit,
  onDelete,
}) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingColumn, setEditingColumn] = useState<VirtualColumnDefinition | null>(null);

  const handleAdd = () => {
    setEditingIndex(null);
    setEditingColumn(null);
    setEditorOpen(true);
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditingColumn(virtualColumns[index]);
    setEditorOpen(true);
  };

  const handleSave = (column: VirtualColumnDefinition) => {
    if (editingIndex !== null) {
      onEdit(editingIndex, column);
    } else {
      onAdd(column);
    }
    setEditorOpen(false);
    setEditingIndex(null);
    setEditingColumn(null);
  };

  const handleCancel = () => {
    setEditorOpen(false);
    setEditingIndex(null);
    setEditingColumn(null);
  };

  const truncateExpression = (expr: string, maxLen: number = 30) => {
    return expr.length > maxLen ? expr.substring(0, maxLen) + '…' : expr;
  };

  return (
    <Box className={styles.fieldCategory}>
      {/* Header with Add button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5, position: 'relative' }}>
        <Typography variant="subtitle2" className={styles.categoryTitle}>
          Virtual Columns
        </Typography>
        <IconButton 
          size="small" 
          onClick={handleAdd} 
          sx={{ p: 0.25, position: 'absolute', right: 0 }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box className={styles.fieldsContainer}>
        {virtualColumns.length === 0 && (
          <Typography variant="body2" className={styles.emptyMessage}>
            No virtual columns available
          </Typography>
        )}

        {/* Compact list */}
        {virtualColumns.map((column, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              py: 0.25,
              px: 0.5,
              borderRadius: 0.5,
              bgcolor: 'action.hover',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.selected' },
              '&:hover .delete-btn': { opacity: 1 },
            }}
            onClick={() => handleEdit(index)}
          >
            <Tooltip title={`${column.expression}${column.description ? ` — ${column.description}` : ''}`}>
              <Typography
                variant="caption"
                sx={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                }}
              >
                <strong>{column.name}</strong>
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 0.5, fontFamily: 'monospace', fontSize: '0.7rem' }}
                >
                  {truncateExpression(column.expression)}
                </Typography>
              </Typography>
            </Tooltip>
            <IconButton
              className="delete-btn"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(index);
              }}
              sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s' }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        ))}
      </Box>

      {/* Editor Dialog */}
      {editorOpen && (
        <VirtualColumnEditor
          open={editorOpen}
          column={editingColumn}
          availableColumns={availableColumns}
          existingNames={virtualColumns.map(c => c.name).filter((_, i) => i !== editingIndex)}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </Box>
  );
};

export default VirtualColumnManager;
