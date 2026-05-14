// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { VirtualColumnDefinition } from '../../types';
import {
  generateBinFieldName,
  suggestBinWidth,
  binWidthFromCount,
  calculateBinCount,
  generateBinExamples,
  createBinnedFieldDefinition,
} from '../../utils/binningUtils';

/**
 * Statistics about the source field needed for binning suggestions.
 */
export interface FieldStats {
  min: number;
  max: number;
  rowCount: number;
}

interface BinConfigDialogProps {
  open: boolean;
  sourceField: string;
  fieldStats: FieldStats | null;
  existingNames: string[];
  onSave: (column: VirtualColumnDefinition) => void;
  onCancel: () => void;
}

type BinMode = 'width' | 'count';

const BinConfigDialog: React.FC<BinConfigDialogProps> = ({
  open,
  sourceField,
  fieldStats,
  existingNames,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [binMode, setBinMode] = useState<BinMode>('width');
  const [binWidth, setBinWidth] = useState<number>(10);
  const [binCount, setBinCount] = useState<number>(10);
  const [errors, setErrors] = useState<{ name?: string; binValue?: string }>({});

  // Calculate suggested bin width when dialog opens or field stats change
  const suggestedWidth = useMemo(() => {
    if (!fieldStats) return 10;
    return suggestBinWidth(fieldStats.min, fieldStats.max, fieldStats.rowCount);
  }, [fieldStats]);

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      setName(generateBinFieldName(sourceField));
      setBinMode('width');
      setBinWidth(suggestedWidth);
      setBinCount(10);
      setErrors({});
    }
  }, [open, sourceField, suggestedWidth]);

  // Calculate effective bin width based on mode
  const effectiveBinWidth = useMemo(() => {
    if (binMode === 'width') {
      return binWidth;
    }
    if (!fieldStats) return binWidth;
    return binWidthFromCount(fieldStats.min, fieldStats.max, binCount);
  }, [binMode, binWidth, binCount, fieldStats]);

  // Calculate effective bin count for display
  const effectiveBinCount = useMemo(() => {
    if (!fieldStats) return 0;
    return calculateBinCount(fieldStats.min, fieldStats.max, effectiveBinWidth);
  }, [fieldStats, effectiveBinWidth]);

  // Generate example bin labels
  const exampleBins = useMemo(() => {
    if (!fieldStats) return [];
    return generateBinExamples(fieldStats.min, effectiveBinWidth, 3);
  }, [fieldStats, effectiveBinWidth]);

  const validateForm = useCallback((): boolean => {
    const newErrors: { name?: string; binValue?: string } = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.replace(/[() ]/g, '_'))) {
      // Allow parentheses and spaces in name, they'll be handled by backend
    }
    
    // Check for duplicate names
    if (existingNames.includes(name.trim())) {
      newErrors.name = 'A field with this name already exists';
    }

    // Validate bin value
    if (binMode === 'width' && binWidth <= 0) {
      newErrors.binValue = 'Bin width must be greater than 0';
    } else if (binMode === 'count' && binCount <= 0) {
      newErrors.binValue = 'Bin count must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, binMode, binWidth, binCount, existingNames]);

  const handleSave = () => {
    if (validateForm()) {
      const virtualColumn = createBinnedFieldDefinition(
        sourceField,
        effectiveBinWidth,
        name.trim()
      );
      onSave(virtualColumn);
    }
  };

  const handleModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: BinMode | null) => {
    if (newMode !== null) {
      setBinMode(newMode);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (errors.name) {
      setErrors(prev => ({ ...prev, name: undefined }));
    }
  };

  const handleBinWidthChange = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setBinWidth(num);
    }
    if (errors.binValue) {
      setErrors(prev => ({ ...prev, binValue: undefined }));
    }
  };

  const handleBinCountChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setBinCount(num);
    }
    if (errors.binValue) {
      setErrors(prev => ({ ...prev, binValue: undefined }));
    }
  };

  // Format numbers for display
  const formatNumber = (n: number): string => {
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ViewColumnIcon />
          <Typography variant="h6">
            Create Bins: {sourceField}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Field Name */}
          <TextField
            label="Field Name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            error={!!errors.name}
            helperText={errors.name || 'Name for the binned field'}
            fullWidth
            required
            autoFocus
          />

          {/* Bin Mode Toggle */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Define bins by:
            </Typography>
            <ToggleButtonGroup
              value={binMode}
              exclusive
              onChange={handleModeChange}
              fullWidth
              size="small"
            >
              <ToggleButton value="width">
                Bin Width
              </ToggleButton>
              <ToggleButton value="count">
                Number of Bins
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Bin Width or Count Input */}
          {binMode === 'width' ? (
            <TextField
              label="Bin Width"
              type="number"
              value={binWidth}
              onChange={(e) => handleBinWidthChange(e.target.value)}
              error={!!errors.binValue}
              helperText={errors.binValue || `Suggested: ${formatNumber(suggestedWidth)}`}
              fullWidth
              required
              inputProps={{ min: 0, step: 'any' }}
            />
          ) : (
            <TextField
              label="Number of Bins"
              type="number"
              value={binCount}
              onChange={(e) => handleBinCountChange(e.target.value)}
              error={!!errors.binValue}
              helperText={errors.binValue || `This will create bins of width ${formatNumber(effectiveBinWidth)}`}
              fullWidth
              required
              inputProps={{ min: 1, step: 1 }}
            />
          )}

          <Divider />

          {/* Preview Section */}
          <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Preview
            </Typography>
            
            {fieldStats ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Data Range:</strong> {formatNumber(fieldStats.min)} – {formatNumber(fieldStats.max)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Row Count:</strong> {formatNumber(fieldStats.rowCount)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Result:</strong> {effectiveBinCount} bins of width {formatNumber(effectiveBinWidth)}
                </Typography>
                
                {exampleBins.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Example bins:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                      {exampleBins.map((bin, idx) => (
                        <Typography
                          key={idx}
                          variant="caption"
                          sx={{
                            fontFamily: 'monospace',
                            bgcolor: 'action.hover',
                            px: 1,
                            py: 0.25,
                            borderRadius: 0.5,
                          }}
                        >
                          {formatNumber(bin)}–{formatNumber(bin + effectiveBinWidth)}
                        </Typography>
                      ))}
                      <Typography variant="caption" color="text.secondary">...</Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <Alert severity="info" sx={{ py: 0.5 }}>
                Loading field statistics...
              </Alert>
            )}
          </Paper>

          {/* Usage Hint */}
          <Alert severity="info" sx={{ py: 0.5 }}>
            <Typography variant="caption">
              The binned field will appear as a discrete dimension. 
              Drag it to an axis with COUNT measure to create a histogram.
            </Typography>
          </Alert>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          disabled={!fieldStats}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BinConfigDialog;
