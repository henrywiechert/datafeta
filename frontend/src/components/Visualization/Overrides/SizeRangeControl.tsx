// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect } from 'react';
import { Box, Slider, Typography, FormControl } from '@mui/material';
import { Field } from '../../../types';

interface SizeRangeControlProps {
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onSizeRangeChange: (range: [number, number]) => void;
  onManualSizeChange: (size: number) => void;
  /** 
   * When true, always show single slider for thickness control regardless of sizeField.
   * Used for tick-strip and gantt charts where sizeField doesn't map to visual size.
   */
  forceSingleSlider?: boolean;
}

const SizeRangeControl: React.FC<SizeRangeControlProps> = ({
  sizeField,
  sizeRange,
  manualSize,
  onSizeRangeChange,
  onManualSizeChange,
  forceSingleSlider = false,
}) => {
  // Local state for visual feedback during dragging
  const [localSizeRange, setLocalSizeRange] = useState<[number, number]>(sizeRange);
  const [localManualSize, setLocalManualSize] = useState<number>(manualSize);

  // Sync local state with props when they change externally
  useEffect(() => {
    setLocalSizeRange(sizeRange);
  }, [sizeRange]);

  useEffect(() => {
    setLocalManualSize(manualSize);
  }, [manualSize]);

  const handleSizeRangeChange = (event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    if (Array.isArray(newValue) && newValue.length === 2) {
      setLocalSizeRange([newValue[0], newValue[1]]);
    }
  };

  const handleSizeRangeCommitted = (event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    if (Array.isArray(newValue) && newValue.length === 2) {
      onSizeRangeChange([newValue[0], newValue[1]]);
    }
  };

  const handleManualSizeChange = (event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    if (typeof newValue === 'number') {
      setLocalManualSize(newValue);
    }
  };

  const handleManualSizeCommitted = (event: Event | React.SyntheticEvent, newValue: number | number[]) => {
    if (typeof newValue === 'number') {
      onManualSizeChange(newValue);
    }
  };

  return (
    <Box sx={{ 
      marginTop: '4px',
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: '#f9f9f9'
    }}>
      {sizeField && !forceSingleSlider ? (
        <FormControl fullWidth>
          <Typography variant="body2" sx={{ 
            fontSize: '0.7rem',
            fontWeight: 500,
            marginBottom: '2px',
            color: '#424242'
          }}>
            Range: {localSizeRange[0]} - {localSizeRange[1]}
          </Typography>
          <Slider
            value={localSizeRange}
            onChange={handleSizeRangeChange}
            onChangeCommitted={handleSizeRangeCommitted}
            valueLabelDisplay="auto"
            min={1}
            max={50}
            size="small"
            sx={{ marginTop: '2px', marginBottom: '2px' }}
          />
        </FormControl>
      ) : (
        <FormControl fullWidth>
          <Typography variant="body2" sx={{ 
            fontSize: '0.7rem',
            fontWeight: 500,
            marginBottom: '2px',
            color: '#424242'
          }}>
            Thickness
          </Typography>
          <Slider
            value={localManualSize}
            onChange={handleManualSizeChange}
            onChangeCommitted={handleManualSizeCommitted}
            valueLabelDisplay="auto"
            min={1}
            max={50}
            size="small"
            sx={{ marginTop: '2px', marginBottom: '2px' }}
          />
        </FormControl>
      )}
    </Box>
  );
};

export default SizeRangeControl;
