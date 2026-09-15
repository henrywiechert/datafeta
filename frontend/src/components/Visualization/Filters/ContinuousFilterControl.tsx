// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect } from 'react';
import {
  Slider,
  TextField,
  Box,
  Typography,
  CircularProgress,
  Checkbox,
  Tooltip,
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
    height: 26,
  },
  '& .MuiInputBase-input': {
    fontSize: '0.8125rem',
    lineHeight: 1.25,
    height: 'auto',
    py: '2px',
    px: 0,
  },
  '& .MuiInput-underline:before': {
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
} as const;

// U+221E is missing from many UI font glyph sets, so the browser substitutes a
// fallback font whose metrics stretch the input's line box. Keep the symbol out
// of the input entirely and paint it as an out-of-flow overlay instead.
const INF = '∞';
const NEG_INF = `-${INF}`;

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
  // Local text state allows free typing before we validate/commit. A null bound
  // is held as an empty string here; the ∞ glyph is drawn as an overlay.
  const isUnbounded = (t: string) => t === '';
  const displayText = (v: number | null | undefined) =>
    v !== null && v !== undefined ? String(v) : '';
  const [minText, setMinText] = useState<string>(displayText(min));
  const [maxText, setMaxText] = useState<string>(displayText(max));
  const [minFocused, setMinFocused] = useState(false);
  const [maxFocused, setMaxFocused] = useState(false);

  // Update local state when props change
  useEffect(() => {
    setSliderValue([
      min ?? metadata.min,
      max ?? metadata.max,
    ]);
    setMinText(displayText(min));
    setMaxText(displayText(max));
  }, [min, max, metadata.min, metadata.max]);

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    setSliderValue([newMin, newMax]);
  };

  const autoRange = min === null || max === null;

  const adaptToRange = (m: number | null, M: number | null): [number | null, number | null] => {
    if (!autoRange) return [m, M];
    const newMin = m !== null && metadata.min != null && m <= metadata.min ? null : m;
    const newMax = M !== null && metadata.max != null && M >= metadata.max ? null : M;
    return [newMin, newMax];
  };

  const handleSliderCommit = (_event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    const [m, M] = adaptToRange(newMin, newMax);
    onChange(m, M);
  };

  const commitMinInput = () => {
    if (isUnbounded(minText)) {
      onChange(null, max);
      return;
    }
    const numValue = Number(minText);
    if (!Number.isNaN(numValue)) {
      const newMin = Math.max(metadata.min, Math.min(numValue, sliderValue[1]));
      const [m, M] = adaptToRange(newMin, max);
      onChange(m, M);
    } else {
      // Invalid input — snap back to current committed value
      setMinText(displayText(min));
    }
  };

  const commitMaxInput = () => {
    if (isUnbounded(maxText)) {
      onChange(min, null);
      return;
    }
    const numValue = Number(maxText);
    if (!Number.isNaN(numValue)) {
      const newMax = Math.min(metadata.max, Math.max(numValue, sliderValue[0]));
      const [m, M] = adaptToRange(min, newMax);
      onChange(m, M);
    } else {
      setMaxText(displayText(max));
    }
  };

  const handleAutoToggle = (_e: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    if (checked) {
      const m = min !== null && metadata.min != null && min <= metadata.min ? null : min;
      const M = max !== null && metadata.max != null && max >= metadata.max ? null : max;
      onChange(m, M);
    } else {
      onChange(min ?? metadata.min, max ?? metadata.max);
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
        <Tooltip title="Adapt bounds to dataset range (endpoints at the dataset extreme follow the loaded dataset)" placement="top">
          <Checkbox
            size="small"
            checked={autoRange}
            onChange={handleAutoToggle}
            className={styles.autoToggle}
            inputProps={{ 'aria-label': 'Adapt bounds to dataset range' }}
          />
        </Tooltip>
      </Box>

      <Box className={styles.inputsRow}>
        <Box className={styles.inputGroup}>
          <Typography component="label" variant="caption" className={styles.rowLabel}>
            Min
          </Typography>
          <Box className={styles.inputWrap}>
            <TextField
              aria-label="Min value"
              type="text"
              size="small"
              variant="standard"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              onFocus={() => setMinFocused(true)}
              onBlur={() => {
                setMinFocused(false);
                commitMinInput();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitMinInput();
              }}
              inputProps={{ min: metadata.min, max: metadata.max, step }}
              className={styles.input}
              sx={compactFieldSx}
            />
            {!minFocused && isUnbounded(minText) && (
              <span className={styles.infOverlay} aria-hidden="true">{NEG_INF}</span>
            )}
          </Box>
        </Box>
        <Box className={styles.inputGroup}>
          <Typography component="label" variant="caption" className={styles.rowLabel}>
            Max
          </Typography>
          <Box className={styles.inputWrap}>
            <TextField
              aria-label="Max value"
              type="text"
              size="small"
              variant="standard"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              onFocus={() => setMaxFocused(true)}
              onBlur={() => {
                setMaxFocused(false);
                commitMaxInput();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitMaxInput();
              }}
              inputProps={{ min: metadata.min, max: metadata.max, step }}
              className={styles.input}
              sx={compactFieldSx}
            />
            {!maxFocused && isUnbounded(maxText) && (
              <span className={styles.infOverlay} aria-hidden="true">{INF}</span>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ContinuousFilterControl;
