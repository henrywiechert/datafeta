import React, { useState, useEffect } from 'react';
import { Box, Slider, Typography, FormControl } from '@mui/material';
import { Field } from '../../../types';
// import styles from './SizeRangeControl.module.css';

interface SizeRangeControlProps {
  sizeField: Field | null;
  sizeRange: [number, number];
  manualSize: number;
  onSizeRangeChange: (range: [number, number]) => void;
  onManualSizeChange: (size: number) => void;
}

const SizeRangeControl: React.FC<SizeRangeControlProps> = ({
  sizeField,
  sizeRange,
  manualSize,
  onSizeRangeChange,
  onManualSizeChange,
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
      marginTop: '12px',
      padding: '8px 12px',
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      backgroundColor: '#fafafa'
    }}>
      {sizeField ? (
        <FormControl fullWidth>
          <Typography variant="body2" sx={{ 
            fontSize: '12px',
            fontWeight: 500,
            marginBottom: '4px',
            color: '#424242'
          }}>
            Size Range: {localSizeRange[0]} - {localSizeRange[1]}
          </Typography>
          <Slider
            value={localSizeRange}
            onChange={handleSizeRangeChange}
            onChangeCommitted={handleSizeRangeCommitted}
            valueLabelDisplay="auto"
            min={1}
            max={50}
            size="small"
            sx={{ marginTop: '4px', marginBottom: '4px' }}
          />
          <Typography variant="caption" sx={{ 
            fontSize: '11px',
            color: '#757575',
            marginTop: '4px',
            display: 'block'
          }}>
            {sizeField.flavour === 'discrete' 
              ? 'Values distributed equally across size range'
              : 'Linear mapping from field values to size range'
            }
          </Typography>
        </FormControl>
      ) : (
        <FormControl fullWidth>
          <Typography variant="body2" sx={{ 
            fontSize: '12px',
            fontWeight: 500,
            marginBottom: '4px',
            color: '#424242'
          }}>
            Manual Size: {localManualSize}
          </Typography>
          <Slider
            value={localManualSize}
            onChange={handleManualSizeChange}
            onChangeCommitted={handleManualSizeCommitted}
            valueLabelDisplay="auto"
            min={1}
            max={50}
            size="small"
            sx={{ marginTop: '4px', marginBottom: '4px' }}
          />
          <Typography variant="caption" sx={{ 
            fontSize: '11px',
            color: '#757575',
            marginTop: '4px',
            display: 'block'
          }}>
            Size when no field is selected
          </Typography>
        </FormControl>
      )}
    </Box>
  );
};

export default SizeRangeControl;