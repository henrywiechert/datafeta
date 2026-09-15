// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect, useId } from 'react';
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
import { T } from '../../../theme/tokens';

interface ContinuousFilterControlProps {
  metadata: ContinuousFilterMetadata;
  min: number | null;
  max: number | null;
  /** Stored adapt-to-range intent; undefined ⇒ derive it from the bounds. */
  adaptToRange?: boolean;
  onChange: (min: number | null, max: number | null, adaptToRange: boolean) => void;
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
    borderBottomColor: T.inputUnderline,
  },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
    borderBottomColor: T.inputUnderlineHover,
  },
} as const;

// U+221E is missing from many UI font glyph sets, so the browser substitutes a
// fallback font whose metrics stretch the input's line box. Keep the symbol out
// of the input entirely and paint it as an out-of-flow overlay instead.
const INF = '∞';
const NEG_INF = `-${INF}`;

// A blank field means "no bound". Whitespace has to count as blank too: Number(' ')
// is 0, not NaN, so an untrimmed space would silently commit a bound of zero.
const isUnbounded = (text: string) => text.trim() === '';

const displayText = (v: number | null | undefined) =>
  v !== null && v !== undefined ? String(v) : '';

/** Slider step: a hundredth of the range, coarsened to a power of ten when wide. */
const computeStep = (range: number) =>
  range > 100 ? Math.pow(10, Math.floor(Math.log10(range)) - 1) : range / 100;

/**
 * Bounds at (or beyond) the dataset extreme become null, i.e. unbounded, so they
 * follow the dataset the next time it loads. Only applied when adapt is on.
 */
const snapExtremesToNull = (
  m: number | null,
  M: number | null,
  dataMin: number,
  dataMax: number,
): [number | null, number | null] => [
  m !== null && m <= dataMin ? null : m,
  M !== null && M >= dataMax ? null : M,
];

// The slider needs concrete numbers; the fallback is unreachable because the
// component bails out above when the dataset range is unknown.
const boundsToSlider = (
  m: number | null,
  M: number | null,
  metadata: ContinuousFilterMetadata,
): [number, number] => [m ?? metadata.min ?? 0, M ?? metadata.max ?? 0];

const ContinuousFilterControl: React.FC<ContinuousFilterControlProps> = ({
  metadata,
  min,
  max,
  adaptToRange,
  onChange,
}) => {
  // Local slider state, so a drag does not round-trip through the parent
  const [sliderValue, setSliderValue] = useState<[number, number]>(
    boundsToSlider(min, max, metadata),
  );
  // Local text state allows free typing before we validate/commit. A null bound
  // is held as an empty string here; the ∞ glyph is drawn as an overlay.
  const [minText, setMinText] = useState<string>(displayText(min));
  const [maxText, setMaxText] = useState<string>(displayText(max));
  const [minFocused, setMinFocused] = useState(false);
  const [maxFocused, setMaxFocused] = useState(false);
  const inputIdPrefix = useId();

  // Update local state when props change
  useEffect(() => {
    setSliderValue(boundsToSlider(min, max, metadata));
    setMinText(displayText(min));
    setMaxText(displayText(max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, metadata.min, metadata.max]);

  // Stored intent, falling back to the old derivation for configs saved without it.
  const adapt = adaptToRange ?? (min === null || max === null);

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

  // Bound to consts so the handlers below close over narrowed numbers.
  const dataMin = metadata.min;
  const dataMax = metadata.max;
  const range = dataMax - dataMin;
  const rangeTitle = `${dataMin.toLocaleString()} – ${dataMax.toLocaleString()}`;

  const adaptBounds = (m: number | null, M: number | null): [number | null, number | null] =>
    adapt ? snapExtremesToNull(m, M, dataMin, dataMax) : [m, M];

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    setSliderValue([newMin, newMax]);
  };

  const handleSliderCommit = (_event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    const [m, M] = adaptBounds(newMin, newMax);
    onChange(m, M, adapt);
  };

  /**
   * Commit a typed bound. The clamped result is written back to local state
   * directly: when it equals the value already committed, the parent re-renders
   * with unchanged props and the sync effect above never runs, which would leave
   * the rejected text sitting in the field.
   */
  const commitInput = (edge: 'min' | 'max') => {
    const rawText = edge === 'min' ? minText : maxText;
    const setText = edge === 'min' ? setMinText : setMaxText;
    const committed = edge === 'min' ? min : max;

    const text = isUnbounded(rawText) ? '' : rawText.trim();
    if (text !== rawText) setText(text);

    // Enter commits, and the blur that follows would commit a second time; a
    // field already showing its committed bound has nothing to commit.
    if (text === displayText(committed)) return;

    if (text === '') {
      const [m, M] = edge === 'min' ? [null, max] : [min, null];
      setSliderValue(boundsToSlider(m, M, metadata));
      onChange(m, M, adapt);
      return;
    }

    const numValue = Number(text);
    if (Number.isNaN(numValue)) {
      // Invalid input — snap back to current committed value
      setText(displayText(committed));
      return;
    }

    // Clamp into the dataset range without crossing the opposite bound.
    const clamped = edge === 'min'
      ? Math.max(dataMin, Math.min(numValue, max ?? dataMax))
      : Math.min(dataMax, Math.max(numValue, min ?? dataMin));
    const [m, M] = edge === 'min' ? adaptBounds(clamped, max) : adaptBounds(min, clamped);

    setText(displayText(edge === 'min' ? m : M));
    setSliderValue(boundsToSlider(m, M, metadata));
    onChange(m, M, adapt);
  };

  const handleAdaptToggle = (_e: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    if (checked) {
      const [m, M] = snapExtremesToNull(min, max, dataMin, dataMax);
      onChange(m, M, true);
    } else {
      onChange(min ?? dataMin, max ?? dataMax, false);
    }
  };

  return (
    <Box className={styles.container} title={`Available: ${rangeTitle}`}>
      <Box className={styles.sliderRow}>
        {range > 0 ? (
          <Slider
            value={sliderValue}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderCommit}
            valueLabelDisplay="auto"
            min={dataMin}
            max={dataMax}
            step={computeStep(range)}
            size="small"
            getAriaLabel={(index) => (index === 0 ? 'Minimum value' : 'Maximum value')}
            sx={{ py: 0.5, my: 0 }}
          />
        ) : (
          // A single-valued column has a zero-width range: a slider over it would
          // divide by zero when positioning its thumbs.
          <Typography variant="caption" color="textSecondary" className={styles.singleValue}>
            Single value: {dataMin.toLocaleString()}
          </Typography>
        )}
        <Tooltip title="Adapt bounds to dataset range (endpoints at the dataset extreme follow the loaded dataset)" placement="top">
          <Checkbox
            size="small"
            checked={adapt}
            onChange={handleAdaptToggle}
            className={styles.autoToggle}
            inputProps={{ 'aria-label': 'Adapt bounds to dataset range' }}
          />
        </Tooltip>
      </Box>

      <Box className={styles.inputsRow}>
        <Box className={styles.inputGroup}>
          <Typography
            component="label"
            htmlFor={`${inputIdPrefix}-min`}
            variant="caption"
            className={styles.rowLabel}
          >
            Min
          </Typography>
          <Box className={styles.inputWrap}>
            <TextField
              id={`${inputIdPrefix}-min`}
              type="text"
              size="small"
              variant="standard"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              onFocus={() => setMinFocused(true)}
              onBlur={() => {
                setMinFocused(false);
                commitInput('min');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInput('min');
              }}
              inputProps={{ inputMode: 'decimal' }}
              className={styles.input}
              sx={compactFieldSx}
            />
            {!minFocused && isUnbounded(minText) && (
              <span className={styles.infOverlay} aria-hidden="true">{NEG_INF}</span>
            )}
          </Box>
        </Box>
        <Box className={styles.inputGroup}>
          <Typography
            component="label"
            htmlFor={`${inputIdPrefix}-max`}
            variant="caption"
            className={styles.rowLabel}
          >
            Max
          </Typography>
          <Box className={styles.inputWrap}>
            <TextField
              id={`${inputIdPrefix}-max`}
              type="text"
              size="small"
              variant="standard"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              onFocus={() => setMaxFocused(true)}
              onBlur={() => {
                setMaxFocused(false);
                commitInput('max');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInput('max');
              }}
              inputProps={{ inputMode: 'decimal' }}
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
