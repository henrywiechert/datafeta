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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* Header with Add button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5, position: 'relative' }}>
        <Typography 
          variant="subtitle2"
          sx={{ 
            fontWeight: 'bold',
            color: 'rgba(0, 0, 0, 0.6)',
          }}
        >
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
