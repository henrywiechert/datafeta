// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Switch,
  TextField,
} from '@mui/material';
import { QueryOptimizationSettings } from '../../../../types';

interface OptimizationSettingsDialogProps {
  open: boolean;
  settings: QueryOptimizationSettings;
  onSettingsChange: (settings: QueryOptimizationSettings) => void;
  onCancel: () => void;
  onApply: () => void;
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
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="optimization-settings-title">
        Query Optimization Settings
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={settings.forceRemote}
              onChange={(e) => onSettingsChange({ ...settings, forceRemote: e.target.checked })}
            />
          }
          label="Force remote query (skip DuckDB cache)"
        />

        <TextField
          label="Large dataset threshold (rows)"
          type="number"
          value={settings.sizeThreshold}
          onChange={(e) => updateNumberSetting('sizeThreshold', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
          helperText="Above this row count, prefer backend aggregation."
        />

        <Divider />

        <TextField
          label="Max points (single chart)"
          type="number"
          value={settings.maxPointsSingle}
          onChange={(e) => updateNumberSetting('maxPointsSingle', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
        />

        <TextField
          label="Max points (faceted charts)"
          type="number"
          value={settings.maxPointsFaceted}
          onChange={(e) => updateNumberSetting('maxPointsFaceted', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
        />

        <TextField
          label="Max points (discrete color cap)"
          type="number"
          value={settings.maxPointsWithDiscreteColor}
          onChange={(e) => updateNumberSetting('maxPointsWithDiscreteColor', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
          helperText="Applied when color field is discrete."
        />

        <TextField
          label="Min per stratum (discrete color)"
          type="number"
          value={settings.minPerStratumWithDiscreteColor}
          onChange={(e) => updateNumberSetting('minPerStratumWithDiscreteColor', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
        />

        <TextField
          label="Line chart max rows"
          type="number"
          value={settings.lineBudgetMaxRows}
          onChange={(e) => updateNumberSetting('lineBudgetMaxRows', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
          helperText="Limits aggregated line results for dense series."
        />

        <Divider />

        <FormControlLabel
          control={
            <Switch
              checked={settings.enableRounding}
              onChange={(e) => onSettingsChange({ ...settings, enableRounding: e.target.checked })}
            />
          }
          label="Enable adaptive rounding"
        />

        <TextField
          label="Rounding threshold (light)"
          type="number"
          value={settings.roundingThresholdLight}
          onChange={(e) => updateNumberSetting('roundingThresholdLight', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
          disabled={!settings.enableRounding}
          helperText="Applies when auto optimization chooses light."
        />

        <TextField
          label="Rounding threshold (balanced)"
          type="number"
          value={settings.roundingThresholdBalanced}
          onChange={(e) => updateNumberSetting('roundingThresholdBalanced', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
          disabled={!settings.enableRounding}
          helperText="Applies when auto optimization chooses balanced."
        />

        <TextField
          label="Rounding threshold (aggressive)"
          type="number"
          value={settings.roundingThresholdAggressive}
          onChange={(e) => updateNumberSetting('roundingThresholdAggressive', e.target.value)}
          inputProps={{ min: 0 }}
          size="small"
          disabled={!settings.enableRounding}
          helperText="Applies when auto optimization chooses aggressive."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onApply}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
