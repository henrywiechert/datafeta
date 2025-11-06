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
      <Typography variant="caption" className={styles.label}>
        Gradient Bias: {getBiasLabel(localBias)}
      </Typography>
      <Slider
        value={localBias}
        onChange={handleSliderChange}
        onChangeCommitted={handleSliderCommit}
        min={-1}
        max={1}
        step={0.05}
        marks={[
          { value: -1, label: 'Left' },
          { value: 0, label: 'Center' },
          { value: 1, label: 'Right' },
        ]}
        valueLabelDisplay="auto"
        valueLabelFormat={(value) => value.toFixed(2)}
        size="small"
        sx={{ 
          mt: 1,
          mb: 0.5,
          '& .MuiSlider-mark': {
            backgroundColor: '#bdbdbd',
            height: 8,
            width: 2,
          },
          '& .MuiSlider-markLabel': {
            fontSize: '10px',
            color: '#757575',
          },
        }}
      />
      <Typography variant="caption" sx={{ fontSize: '11px', color: '#757575', mt: 0.5, display: 'block' }}>
        Adjust color emphasis: left biases towards lower values, right towards higher values
      </Typography>
    </Box>
  );
};

export default ColorBiasControl;
