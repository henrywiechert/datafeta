// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect } from 'react';
import {
  Slider,
  TextField,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { ContinuousFilterMetadata } from '../../../types';
import styles from './ContinuousFilterControl.module.css';

interface ContinuousFilterControlProps {
  metadata: ContinuousFilterMetadata;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

const compactFieldSx = {
  '& .MuiInputBase-root': {
    minHeight: 0,
    height: 20,
  },
  '& .MuiInputBase-input': {
    fontSize: '0.75rem',
    lineHeight: 1.2,
    height: 'auto',
    py: 0,
    px: 0,
  },
  '& .MuiInput-underline:before': {
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
} as const;

const ContinuousFilterControl: React.FC<ContinuousFilterControlProps> = ({
  metadata,
  min,
  max,
  onChange,
}) => {
  // Local state for slider (to avoid re-rendering issues during drag)
  const [sliderValue, setSliderValue] = useState<[number, number]>([
    min ?? metadata.min,
    max ?? metadata.max,
  ]);
  // Local text state allows free typing before we validate/commit
  const [minText, setMinText] = useState<string>(min !== null && min !== undefined ? String(min) : '');
  const [maxText, setMaxText] = useState<string>(max !== null && max !== undefined ? String(max) : '');

  // Update local state when props change
  useEffect(() => {
    setSliderValue([
      min ?? metadata.min,
      max ?? metadata.max,
    ]);
    setMinText(min !== null && min !== undefined ? String(min) : '');
    setMaxText(max !== null && max !== undefined ? String(max) : '');
  }, [min, max, metadata.min, metadata.max]);

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    setSliderValue([newMin, newMax]);
  };

  const handleSliderCommit = (_event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    onChange(newMin, newMax);
  };

  const commitMinInput = () => {
    if (minText === '') {
      onChange(null, max);
      return;
    }
    const numValue = Number(minText);
    if (!Number.isNaN(numValue)) {
      const newMin = Math.max(metadata.min, Math.min(numValue, sliderValue[1]));
      onChange(newMin, max);
    }
  };

  const commitMaxInput = () => {
    if (maxText === '') {
      onChange(min, null);
      return;
    }
    const numValue = Number(maxText);
    if (!Number.isNaN(numValue)) {
      const newMax = Math.min(metadata.max, Math.max(numValue, sliderValue[0]));
      onChange(min, newMax);
    }
  };

  if (metadata.loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ ml: 1, fontSize: '0.7rem' }}>
          Loading range...
        </Typography>
      </Box>
    );
  }

  if (metadata.error) {
    return (
      <Box className={styles.container}>
        <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem' }}>
          Error: {metadata.error}
        </Typography>
      </Box>
    );
  }

  if (metadata.min == null || metadata.max == null) {
    return (
      <Box className={styles.container}>
        <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
          No range data available for this filter.
        </Typography>
      </Box>
    );
  }

  const range = metadata.max - metadata.min;
  const step = range > 100 ? Math.pow(10, Math.floor(Math.log10(range)) - 1) : range / 100;
  const rangeTitle = `${metadata.min.toLocaleString()} – ${metadata.max.toLocaleString()}`;

  return (
    <Box className={styles.container} title={`Available: ${rangeTitle}`}>
      <Box className={styles.sliderRow}>
        <Slider
          value={sliderValue}
          onChange={handleSliderChange}
          onChangeCommitted={handleSliderCommit}
          valueLabelDisplay="auto"
          min={metadata.min}
          max={metadata.max}
          step={step}
          size="small"
          sx={{ py: 0.5, my: 0 }}
        />
      </Box>

      <Box className={styles.inputsRow}>
        <Box className={styles.inputGroup}>
          <Typography component="label" variant="caption" className={styles.rowLabel}>
            Min
          </Typography>
          <TextField
            aria-label="Min value"
            type="text"
            size="small"
            variant="standard"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={commitMinInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMinInput();
            }}
            inputProps={{ min: metadata.min, max: metadata.max, step }}
            className={styles.input}
            sx={compactFieldSx}
          />
        </Box>
        <Box className={styles.inputGroup}>
          <Typography component="label" variant="caption" className={styles.rowLabel}>
            Max
          </Typography>
          <TextField
            aria-label="Max value"
            type="text"
            size="small"
            variant="standard"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={commitMaxInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMaxInput();
            }}
            inputProps={{ min: metadata.min, max: metadata.max, step }}
            className={styles.input}
            sx={compactFieldSx}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default ContinuousFilterControl;
