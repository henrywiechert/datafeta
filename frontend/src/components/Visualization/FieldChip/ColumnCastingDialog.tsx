import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Box,
  FormHelperText,
} from '@mui/material';
import { ColumnCastConfig } from '../../../types';

export interface ColumnCastingDialogProps {
  open: boolean;
  columnName: string;
  currentConfig?: ColumnCastConfig;
  onConfirm: (config: ColumnCastConfig | null) => void;
  onCancel: () => void;
}

const ColumnCastingDialog: React.FC<ColumnCastingDialogProps> = ({
  open,
  columnName,
  currentConfig,
  onConfirm,
  onCancel,
}) => {
  const [castType, setCastType] = useState<ColumnCastConfig['cast_type']>(
    currentConfig?.cast_type || 'BIGINT'
  );
  const [replacementPattern, setReplacementPattern] = useState<string>(
    currentConfig?.replacement_pattern || ''
  );

  const handleConfirm = useCallback(() => {
    const config: ColumnCastConfig = {
      cast_type: castType,
      replacement_pattern: replacementPattern || undefined,
    };
    onConfirm(config);
  }, [castType, replacementPattern, onConfirm]);

  const handleRemove = useCallback(() => {
    // Pass null to indicate removal of casting
    onConfirm(null);
  }, [onConfirm]);

  // Get cast type descriptions
  const castTypeDescriptions: Record<ColumnCastConfig['cast_type'], string> = {
    'BIGINT': 'Large integer (64-bit)',
    'INTEGER': 'Standard integer (32-bit)',
    'DOUBLE': 'Double precision float',
    'FLOAT': 'Single precision float',
    'VARCHAR': 'Text/String',
  };

  // Get pattern suggestions based on cast type
  const getPatternSuggestions = (): string[] => {
    if (castType === 'BIGINT' || castType === 'INTEGER' || castType === 'DOUBLE' || castType === 'FLOAT') {
      return [',', '.', ' ', '_', "'"];
    }
    return [];
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth onMouseDown={(e) => e.stopPropagation()}>
      <DialogTitle>Configure Column Casting</DialogTitle>
      <DialogContent sx={{ pt: 2 }} onMouseDown={(e) => e.stopPropagation()}>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
          Column: <strong>{columnName}</strong>
        </Typography>

        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="cast-type-label">Cast Type</InputLabel>
          <Select
            labelId="cast-type-label"
            id="cast-type-select"
            value={castType}
            label="Cast Type"
            onChange={(e) => setCastType(e.target.value as ColumnCastConfig['cast_type'])}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MenuItem value="BIGINT">BIGINT</MenuItem>
            <MenuItem value="INTEGER">INTEGER</MenuItem>
            <MenuItem value="DOUBLE">DOUBLE</MenuItem>
            <MenuItem value="FLOAT">FLOAT</MenuItem>
            <MenuItem value="VARCHAR">VARCHAR</MenuItem>
          </Select>
          <FormHelperText>
            {castTypeDescriptions[castType]}
          </FormHelperText>
        </FormControl>

        <TextField
          fullWidth
          label="Replacement Pattern (Optional)"
          placeholder="e.g., ',' for thousands separator"
          value={replacementPattern}
          onChange={(e) => setReplacementPattern(e.target.value)}
          variant="outlined"
          sx={{ mb: 2 }}
          helperText="Character or string to remove before casting (e.g., '1,000' with pattern ',' becomes '1000')"
          onMouseDown={(e) => e.stopPropagation()}
        />

        {getPatternSuggestions().length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" color="textSecondary">
              Common patterns for {castType}:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              {getPatternSuggestions().map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outlined"
                  size="small"
                  onClick={() => setReplacementPattern(suggestion)}
                  onMouseDown={(e) => e.stopPropagation()}
                  sx={{
                    textTransform: 'none',
                    minWidth: 'auto',
                    px: 2,
                    backgroundColor: replacementPattern === suggestion ? 'action.selected' : undefined,
                  }}
                >
                  '{suggestion}'
                </Button>
              ))}
            </Box>
          </Box>
        )}

        <Typography variant="body2" sx={{ mt: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
          <strong>Preview:</strong> Values will be processed as: <code>CAST(REPLACE({columnName}, '{replacementPattern || 'none'}', '') AS {castType})</code>
        </Typography>
      </DialogContent>
      <DialogActions onMouseDown={(e) => e.stopPropagation()}>
        <Button onClick={onCancel} onMouseDown={(e) => e.stopPropagation()}>Cancel</Button>
        {currentConfig && (
          <Button onClick={handleRemove} color="error" onMouseDown={(e) => e.stopPropagation()}>
            Remove Casting
          </Button>
        )}
        <Button onClick={handleConfirm} variant="contained" onMouseDown={(e) => e.stopPropagation()}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ColumnCastingDialog;
