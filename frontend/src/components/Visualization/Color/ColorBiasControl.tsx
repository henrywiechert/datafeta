// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect } from 'react';
import { Box, Slider } from '@mui/material';
import styles from './ColorBiasControl.module.css';
import { T } from '../../../theme/tokens';

interface ColorBiasControlProps {
  colorBias: number;
  onChange: (bias: number) => void;
}

const ColorBiasControl: React.FC<ColorBiasControlProps> = ({ colorBias, onChange }) => {
  const [localBias, setLocalBias] = useState<number>(colorBias);

  useEffect(() => {
    setLocalBias(colorBias);
  }, [colorBias]);

  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    setLocalBias(newValue as number);
  };

  const handleSliderCommit = (event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    onChange(newValue as number);
  };

  return (
    <Box className={styles.container}>
      <Slider
        value={localBias}
        onChange={handleSliderChange}
        onChangeCommitted={handleSliderCommit}
        min={-1}
        max={1}
        step={0.05}
        valueLabelDisplay="auto"
        valueLabelFormat={(value) => value.toFixed(2)}
        size="small"
        sx={{ 
          mt: 0.5,
          mb: 0.25,
          '& .MuiSlider-mark': {
            backgroundColor: T.sliderRailDisabled,
            height: 6,
            width: 1,
          },
          '& .MuiSlider-markLabel': {
            fontSize: '0.65rem',
            color: T.textPlaceholder,
          },
        }}
      />
    </Box>
  );
};

export default ColorBiasControl;
