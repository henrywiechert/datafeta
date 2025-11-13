import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Paper,
  Divider,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FunctionsIcon from '@mui/icons-material/Functions';
import { VirtualColumnDefinition } from '../../types';
import VirtualColumnEditor from './VirtualColumnEditor';

interface VirtualColumnManagerProps {
  virtualColumns: VirtualColumnDefinition[];
  availableColumns: string[];  // Real columns available for use in expressions
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

  const handleDelete = (index: number) => {
    if (window.confirm(`Delete virtual column "${virtualColumns[index].name}"?`)) {
      onDelete(index);
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type) {
      case 'numeric':
        return 'primary';
      case 'text':
        return 'secondary';
      case 'datetime':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FunctionsIcon color="primary" />
          <Typography variant="h6">Virtual Columns</Typography>
          <Chip 
            label={virtualColumns.length} 
            size="small" 
            color="primary" 
            variant="outlined"
          />
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
          size="small"
        >
          New
        </Button>
      </Box>

      <Divider />

      {/* Virtual Columns List */}
      {virtualColumns.length === 0 ? (
        <Paper 
          sx={{ 
            p: 3, 
            textAlign: 'center', 
            bgcolor: 'background.default',
            border: '2px dashed',
            borderColor: 'divider'
          }}
        >
          <FunctionsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary" gutterBottom>
            No virtual columns defined
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Create calculated columns using SQL expressions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            size="small"
          >
            Create First Virtual Column
          </Button>
        </Paper>
      ) : (
        <List sx={{ flex: 1, overflow: 'auto', p: 0 }}>
          {virtualColumns.map((column, index) => (
            <Paper key={index} sx={{ mb: 1 }}>
              <ListItem>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" component="span">
                        {column.name}
                      </Typography>
                      {column.output_type && (
                        <Chip
                          label={column.output_type}
                          size="small"
                          color={getTypeColor(column.output_type)}
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5 }}>
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{
                          fontFamily: 'monospace',
                          bgcolor: 'action.hover',
                          p: 0.5,
                          borderRadius: 0.5,
                          mb: 0.5,
                        }}
                      >
                        {column.expression}
                      </Typography>
                      {column.description && (
                        <Typography variant="caption" color="text.secondary">
                          {column.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Edit">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleEdit(index)}
                      sx={{ mr: 0.5 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleDelete(index)}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            </Paper>
          ))}
        </List>
      )}

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
