import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  Chip,
  Autocomplete,
  Paper,
  Divider,
} from '@mui/material';
import FunctionsIcon from '@mui/icons-material/Functions';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { VirtualColumnDefinition } from '../../types';

interface VirtualColumnEditorProps {
  open: boolean;
  column: VirtualColumnDefinition | null;
  availableColumns: string[];
  existingNames: string[];
  onSave: (column: VirtualColumnDefinition) => void;
  onCancel: () => void;
}

const VirtualColumnEditor: React.FC<VirtualColumnEditorProps> = ({
  open,
  column,
  availableColumns,
  existingNames,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [outputType, setOutputType] = useState<'numeric' | 'text' | 'datetime' | ''>('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Initialize form when dialog opens or column changes
  useEffect(() => {
    if (open) {
      if (column) {
        setName(column.name);
        setExpression(column.expression);
        setOutputType(column.output_type || '');
        setDescription(column.description || '');
      } else {
        setName('');
        setExpression('');
        setOutputType('');
        setDescription('');
      }
      setErrors({});
    }
  }, [open, column]);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      newErrors.name = 'Name must start with letter/underscore and contain only letters, numbers, underscores';
    } else if (existingNames.includes(name)) {
      newErrors.name = 'A virtual column with this name already exists';
    }

    // Validate expression
    if (!expression.trim()) {
      newErrors.expression = 'Expression is required';
    } else {
      // Basic validation - check for dangerous keywords
      const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE'];
      const upperExpr = expression.toUpperCase();
      for (const keyword of dangerousKeywords) {
        if (upperExpr.includes(keyword)) {
          newErrors.expression = `Expression cannot contain dangerous keyword: ${keyword}`;
          break;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      const virtualColumn: VirtualColumnDefinition = {
        name: name.trim(),
        expression: expression.trim(),
        output_type: outputType || undefined,
        description: description.trim() || undefined,
      };
      onSave(virtualColumn);
    }
  };

  const insertColumn = (columnName: string) => {
    // Insert column name at cursor position in expression field
    const textField = document.getElementById('expression-input') as HTMLInputElement;
    if (textField) {
      const start = textField.selectionStart || 0;
      const end = textField.selectionEnd || 0;
      const newExpression = 
        expression.substring(0, start) + columnName + expression.substring(end);
      setExpression(newExpression);
      
      // Set cursor after inserted text
      setTimeout(() => {
        textField.focus();
        textField.setSelectionRange(start + columnName.length, start + columnName.length);
      }, 0);
    }
  };

  const exampleExpressions = [
    { label: 'Arithmetic', value: '(revenue - cost) / revenue * 100', type: 'numeric' },
    { label: 'Rounding', value: 'ROUND(amount, 2)', type: 'numeric' },
    { label: 'String concat', value: 'CONCAT(first_name, \' \', last_name)', type: 'text' },
    { label: 'Conditional', value: 'CASE WHEN amount > 1000 THEN \'High\' ELSE \'Low\' END', type: 'text' },
    { label: 'Multi-condition', value: 'CASE WHEN score >= 90 THEN \'A\' WHEN score >= 80 THEN \'B\' ELSE \'C\' END', type: 'text' },
    { label: 'Absolute value', value: 'ABS(delta)', type: 'numeric' },
    { label: 'Upper case', value: 'UPPER(status)', type: 'text' },
  ];

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FunctionsIcon />
          <Typography variant="h6">
            {column ? 'Edit Virtual Column' : 'New Virtual Column'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Name Field */}
          <TextField
            label="Column Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!errors.name}
            helperText={errors.name || 'Use letters, numbers, and underscores only (e.g., profit_margin)'}
            fullWidth
            required
            autoFocus={!column}
          />

          {/* Expression Field */}
          <Box>
            <TextField
              id="expression-input"
              label="SQL Expression"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              error={!!errors.expression}
              helperText={errors.expression || 'Enter a SQL expression using columns and functions'}
              fullWidth
              required
              multiline
              rows={3}
              sx={{ fontFamily: 'monospace' }}
            />

            {/* Available Columns */}
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Available columns (click to insert):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {availableColumns.map((col) => (
                  <Chip
                    key={col}
                    label={col}
                    size="small"
                    onClick={() => insertColumn(col)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          {/* Output Type */}
          <FormControl fullWidth>
            <InputLabel>Output Type (Optional)</InputLabel>
            <Select
              value={outputType}
              label="Output Type (Optional)"
              onChange={(e) => setOutputType(e.target.value as any)}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="numeric">Numeric</MenuItem>
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="datetime">DateTime</MenuItem>
            </Select>
          </FormControl>

          {/* Description */}
          <TextField
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            helperText="Optional description to help identify this column"
            fullWidth
            multiline
            rows={2}
          />

          <Divider />

          {/* Help Section */}
          <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <HelpOutlineIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2">Example Expressions</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {exampleExpressions.map((example, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={example.label} size="small" variant="outlined" sx={{ minWidth: 100 }} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      bgcolor: 'action.hover',
                      px: 1,
                      py: 0.25,
                      borderRadius: 0.5,
                      cursor: 'pointer',
                      flex: 1,
                      '&:hover': { bgcolor: 'action.selected' }
                    }}
                    onClick={() => setExpression(example.value)}
                  >
                    {example.value}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Alert severity="info" sx={{ mt: 1.5 }}>
              <Typography variant="caption">
                <strong>Supported:</strong> Arithmetic (+, -, *, /, %), 
                Functions (ROUND, ABS, COALESCE, CONCAT, UPPER, LOWER, etc.), 
                Conditionals (CASE WHEN ... THEN ... ELSE ... END)
              </Typography>
            </Alert>
          </Paper>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {column ? 'Save Changes' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VirtualColumnEditor;
