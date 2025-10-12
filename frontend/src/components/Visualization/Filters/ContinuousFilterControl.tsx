import React, { useState, useEffect } from 'react';
import { 
  Slider, 
  TextField, 
  Box, 
  Typography,
  CircularProgress
} from '@mui/material';
import { ContinuousFilterMetadata } from '../../../types';
import styles from './ContinuousFilterControl.module.css';

interface ContinuousFilterControlProps {
  metadata: ContinuousFilterMetadata;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

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

  // Update local state when props change
  useEffect(() => {
    setSliderValue([
      min ?? metadata.min,
      max ?? metadata.max,
    ]);
  }, [min, max, metadata.min, metadata.max]);

  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    setSliderValue([newMin, newMax]);
  };

  const handleSliderCommit = (event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const [newMin, newMax] = newValue as [number, number];
    onChange(newMin, newMax);
  };

  const handleMinInputChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const newMin = Math.max(metadata.min, Math.min(numValue, sliderValue[1]));
      onChange(newMin, max);
    } else if (value === '') {
      onChange(null, max);
    }
  };

  const handleMaxInputChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const newMax = Math.min(metadata.max, Math.max(numValue, sliderValue[0]));
      onChange(min, newMax);
    } else if (value === '') {
      onChange(min, null);
    }
  };

  if (metadata.loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={20} />
        <Typography variant="caption" sx={{ ml: 1 }}>
          Loading range...
        </Typography>
      </Box>
    );
  }

  if (metadata.error) {
    return (
      <Box className={styles.container}>
        <Typography variant="caption" color="error">
          Error: {metadata.error}
        </Typography>
      </Box>
    );
  }

  const range = metadata.max - metadata.min;
  const step = range > 100 ? Math.pow(10, Math.floor(Math.log10(range)) - 1) : range / 100;

  return (
    <Box className={styles.container}>
      <Box className={styles.filterBox}>
        {/* Range header inside frame */}
        <Box className={styles.rangeHeader}>
          <Typography variant="caption" color="textSecondary">
            Available range: {metadata.min.toLocaleString()} - {metadata.max.toLocaleString()}
          </Typography>
        </Box>

        {/* Slider */}
        <Box className={styles.sliderContainer}>
          <Slider
            value={sliderValue}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderCommit}
            valueLabelDisplay="auto"
            min={metadata.min}
            max={metadata.max}
            step={step}
            size="small"
          />
        </Box>

        {/* Input fields */}
        <Box className={styles.inputsContainer}>
          <Box className={styles.inputGroup}>
            <Typography variant="caption" className={styles.inputLabel}>Min</Typography>
            <TextField
              aria-label="Min value"
              type="number"
              size="small"
              value={min ?? ''}
              onChange={(e) => handleMinInputChange(e.target.value)}
              inputProps={{
                min: metadata.min,
                max: metadata.max,
                step,
              }}
              className={styles.input}
            />
          </Box>
          <Box className={styles.inputGroup}>
            <Typography variant="caption" className={styles.inputLabel}>Max</Typography>
            <TextField
              aria-label="Max value"
              type="number"
              size="small"
              value={max ?? ''}
              onChange={(e) => handleMaxInputChange(e.target.value)}
              inputProps={{
                min: metadata.min,
                max: metadata.max,
                step,
              }}
              className={styles.input}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ContinuousFilterControl;


