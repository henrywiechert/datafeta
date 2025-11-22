import React, { useState, useEffect } from 'react';
import { Box, Slider, Typography } from '@mui/material';
import styles from './ColorBiasControl.module.css';

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

  const getBiasLabel = (value: number): string => {
    if (value < -0.6) return 'Strong Left';
    if (value < -0.2) return 'Left';
    if (value > 0.6) return 'Strong Right';
    if (value > 0.2) return 'Right';
    return 'Centered';
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
            backgroundColor: '#bdbdbd',
            height: 6,
            width: 1,
          },
          '& .MuiSlider-markLabel': {
            fontSize: '0.65rem',
            color: '#757575',
          },
        }}
      />
    </Box>
  );
};

export default ColorBiasControl;
