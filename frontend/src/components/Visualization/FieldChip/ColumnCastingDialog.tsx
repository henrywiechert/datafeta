// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Typography,
  Box,
  Tooltip,
} from '@mui/material';
import { ColumnCastConfig } from '../../../types';

export interface ColumnCastingDialogProps {
  open: boolean;
  columnName: string;
  currentConfig?: ColumnCastConfig;
  onConfirm: (config: ColumnCastConfig | null) => void;
  onCancel: () => void;
}

const CAST_TYPE_DESCRIPTIONS: Record<ColumnCastConfig['cast_type'], string> = {
  BIGINT: 'Large integer (64-bit)',
  INTEGER: 'Standard integer (32-bit)',
  DOUBLE: 'Double precision float',
  FLOAT: 'Single precision float',
  VARCHAR: 'Text/String',
};

const NUMERIC_PATTERN_SUGGESTIONS = [',', '.', ' ', '_', "'"] as const;

const labelSx = {
  fontSize: '0.7rem',
  fontWeight: 500,
  color: 'rgba(0, 0, 0, 0.6)',
  lineHeight: 1.2,
  mb: 0.25,
} as const;

const compactFieldSx = {
  '& .MuiInputBase-root': {
    minHeight: 0,
    fontSize: '0.75rem',
  },
  '& .MuiInputBase-input': {
    fontSize: '0.75rem',
    py: 0.25,
  },
  '& .MuiSelect-select': {
    py: 0.25,
  },
  '& .MuiInput-underline:before': {
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
} as const;

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
    onConfirm(null);
  }, [onConfirm]);

  const showPatternSuggestions =
    castType === 'BIGINT' ||
    castType === 'INTEGER' ||
    castType === 'DOUBLE' ||
    castType === 'FLOAT';

  const previewPattern = replacementPattern || 'none';

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth={false}
      onMouseDown={(e) => e.stopPropagation()}
      PaperProps={{
        sx: {
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 1,
        },
      }}
    >
      <DialogTitle
        sx={{ px: 1.5, py: 1, fontSize: '0.875rem', fontWeight: 600 }}
      >
        Configure casting
      </DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          px: 1.5,
          pt: 0.5,
          pb: 1,
          '&.MuiDialogContent-root': { pt: 0.5 },
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Typography
          variant="caption"
          sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.3 }}
        >
          Column: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{columnName}</Box>
        </Typography>

        <Box>
          <Typography component="label" sx={labelSx} htmlFor="cast-type-select">
            Cast type
          </Typography>
          <FormControl fullWidth size="small" variant="standard">
            <Select
              id="cast-type-select"
              value={castType}
              onChange={(e) => setCastType(e.target.value as ColumnCastConfig['cast_type'])}
              onMouseDown={(e) => e.stopPropagation()}
              disableUnderline
              sx={{
                fontSize: '0.75rem',
                '& .MuiSelect-select': { py: 0.25, pr: '24px !important' },
              }}
              MenuProps={{
                MenuListProps: { dense: true },
                PaperProps: {
                  sx: {
                    '& .MuiMenuItem-root': { fontSize: '0.75rem', minHeight: 28, py: 0.5 },
                  },
                },
              }}
            >
              <MenuItem dense value="BIGINT">BIGINT</MenuItem>
              <MenuItem dense value="INTEGER">INTEGER</MenuItem>
              <MenuItem dense value="DOUBLE">DOUBLE</MenuItem>
              <MenuItem dense value="FLOAT">FLOAT</MenuItem>
              <MenuItem dense value="VARCHAR">VARCHAR</MenuItem>
            </Select>
          </FormControl>
          <Typography
            variant="caption"
            sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25, display: 'block' }}
          >
            {CAST_TYPE_DESCRIPTIONS[castType]}
          </Typography>
        </Box>

        <Box>
          <Tooltip
            title="Character or string to remove before casting (e.g. '1,000' with ',' → '1000')"
            placement="left"
            enterDelay={400}
          >
            <Typography component="label" sx={labelSx} htmlFor="cast-replacement">
              Replacement pattern
            </Typography>
          </Tooltip>
          <TextField
            id="cast-replacement"
            fullWidth
            size="small"
            variant="standard"
            placeholder="e.g. , for thousands separator"
            value={replacementPattern}
            onChange={(e) => setReplacementPattern(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            inputProps={{ 'aria-label': 'Replacement pattern' }}
            sx={compactFieldSx}
          />
        </Box>

        {showPatternSuggestions && (
          <Box>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}
            >
              Common patterns
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {NUMERIC_PATTERN_SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant={replacementPattern === suggestion ? 'outlined' : 'text'}
                  size="small"
                  onClick={() => setReplacementPattern(suggestion)}
                  onMouseDown={(e) => e.stopPropagation()}
                  sx={{
                    textTransform: 'none',
                    minWidth: 28,
                    px: 0.75,
                    py: 0,
                    fontSize: '0.7rem',
                    lineHeight: 1.4,
                    minHeight: 24,
                    backgroundColor:
                      replacementPattern === suggestion ? 'action.selected' : undefined,
                  }}
                >
                  '{suggestion}'
                </Button>
              ))}
            </Box>
          </Box>
        )}

        <Typography
          variant="caption"
          component="div"
          sx={{
            fontSize: '0.65rem',
            color: 'text.secondary',
            lineHeight: 1.4,
            px: 0.75,
            py: 0.5,
            backgroundColor: '#f5f5f5',
            borderRadius: 1,
            wordBreak: 'break-all',
          }}
        >
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Preview:{' '}
          </Box>
          <code>
            CAST(REPLACE({columnName}, '{previewPattern}', '') AS {castType})
          </code>
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 1.5, py: 0.75, gap: 0.5 }} onMouseDown={(e) => e.stopPropagation()}>
        <Button
          size="small"
          onClick={onCancel}
          onMouseDown={(e) => e.stopPropagation()}
          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
        >
          Cancel
        </Button>
        {currentConfig && (
          <Button
            size="small"
            color="error"
            onClick={handleRemove}
            onMouseDown={(e) => e.stopPropagation()}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Remove
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          onClick={handleConfirm}
          onMouseDown={(e) => e.stopPropagation()}
          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ColumnCastingDialog;
