// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { QueryOptimizationSettings } from '../../../../types';

interface OptimizationSettingsDialogProps {
  open: boolean;
  settings: QueryOptimizationSettings;
  onSettingsChange: (settings: QueryOptimizationSettings) => void;
  onCancel: () => void;
  onApply: () => void;
}

interface NumberRowProps {
  label: string;
  hint?: string;
  value: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function NumberRow({ label, hint, value, disabled, onChange }: NumberRowProps) {
  const field = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px',
        alignItems: 'center',
        gap: 1,
        minHeight: 28,
      }}
    >
      <Typography
        component="label"
        variant="body2"
        sx={{
          fontSize: '0.75rem',
          color: disabled ? 'text.disabled' : 'text.primary',
          lineHeight: 1.3,
        }}
      >
        {label}
      </Typography>
      <TextField
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        size="small"
        variant="standard"
        inputProps={{ min: 0, 'aria-label': label }}
        sx={{
          '& .MuiInputBase-input': {
            fontSize: '0.75rem',
            py: 0.25,
            textAlign: 'right',
          },
        }}
      />
    </Box>
  );

  return hint ? (
    <Tooltip title={hint} placement="left" enterDelay={400}>
      {field}
    </Tooltip>
  ) : (
    field
  );
}

export default function OptimizationSettingsDialog({
  open,
  settings,
  onSettingsChange,
  onCancel,
  onApply,
}: OptimizationSettingsDialogProps) {
  const updateNumberSetting = (key: keyof QueryOptimizationSettings, value: string) => {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      onSettingsChange({ ...settings, [key]: parsed });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby="optimization-settings-title"
      maxWidth={false}
      PaperProps={{
        sx: {
          width: 360,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 1,
        },
      }}
    >
      <DialogTitle
        id="optimization-settings-title"
        sx={{ px: 1.5, py: 1, fontSize: '0.875rem', fontWeight: 600 }}
      >
        Query optimization
      </DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          px: 1.5,
          pt: 0.5,
          pb: 1,
          // Override MUI's default DialogContent top padding when following DialogTitle
          '&.MuiDialogContent-root': { pt: 0.5 },
        }}
      >
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.forceRemote}
              onChange={(e) => onSettingsChange({ ...settings, forceRemote: e.target.checked })}
            />
          }
          label="Force remote query (skip DuckDB cache)"
          sx={{
            mx: 0,
            '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
          }}
        />

        <NumberRow
          label="Large dataset threshold (rows)"
          hint="Above this row count, prefer backend aggregation."
          value={settings.sizeThreshold}
          onChange={(v) => updateNumberSetting('sizeThreshold', v)}
        />

        <Divider sx={{ my: 0.25 }} />

        <NumberRow
          label="Max points (single chart)"
          value={settings.maxPointsSingle}
          onChange={(v) => updateNumberSetting('maxPointsSingle', v)}
        />
        <NumberRow
          label="Max points (faceted charts)"
          value={settings.maxPointsFaceted}
          onChange={(v) => updateNumberSetting('maxPointsFaceted', v)}
        />
        <NumberRow
          label="Max points (discrete color cap)"
          hint="Applied when color field is discrete."
          value={settings.maxPointsWithDiscreteColor}
          onChange={(v) => updateNumberSetting('maxPointsWithDiscreteColor', v)}
        />
        <NumberRow
          label="Min per stratum (discrete color)"
          value={settings.minPerStratumWithDiscreteColor}
          onChange={(v) => updateNumberSetting('minPerStratumWithDiscreteColor', v)}
        />
        <NumberRow
          label="Line chart max rows"
          hint="Limits aggregated line results for dense series."
          value={settings.lineBudgetMaxRows}
          onChange={(v) => updateNumberSetting('lineBudgetMaxRows', v)}
        />

        <Divider sx={{ my: 0.25 }} />

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.enableRounding}
              onChange={(e) => onSettingsChange({ ...settings, enableRounding: e.target.checked })}
            />
          }
          label="Enable adaptive rounding"
          sx={{
            mx: 0,
            '& .MuiFormControlLabel-label': { fontSize: '0.75rem' },
          }}
        />

        <NumberRow
          label="Rounding threshold (light)"
          hint="Applies when auto optimization chooses light."
          value={settings.roundingThresholdLight}
          disabled={!settings.enableRounding}
          onChange={(v) => updateNumberSetting('roundingThresholdLight', v)}
        />
        <NumberRow
          label="Rounding threshold (balanced)"
          hint="Applies when auto optimization chooses balanced."
          value={settings.roundingThresholdBalanced}
          disabled={!settings.enableRounding}
          onChange={(v) => updateNumberSetting('roundingThresholdBalanced', v)}
        />
        <NumberRow
          label="Rounding threshold (aggressive)"
          hint="Applies when auto optimization chooses aggressive."
          value={settings.roundingThresholdAggressive}
          disabled={!settings.enableRounding}
          onChange={(v) => updateNumberSetting('roundingThresholdAggressive', v)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 1.5, py: 0.75, gap: 0.5 }}>
        <Button size="small" onClick={onCancel} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onApply}
          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
