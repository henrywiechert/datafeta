import React, { useState, useMemo } from 'react';
import { 
  Checkbox, 
  FormControlLabel, 
  Button, 
  Box, 
  TextField,
  CircularProgress,
  Typography
} from '@mui/material';
import { DiscreteFilterMetadata } from '../../../types';
import styles from './DiscreteFilterControl.module.css';

interface DiscreteFilterControlProps {
  metadata: DiscreteFilterMetadata;
  selectedValues: any[];
  onChange: (selectedValues: any[]) => void;
}

const DiscreteFilterControl: React.FC<DiscreteFilterControlProps> = ({
  metadata,
  selectedValues,
  onChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Sort and filter available values based on search term
  const filteredValues = useMemo(() => {
    // First, filter based on search term
    let values = metadata.availableValues;
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      values = values.filter(value => 
        String(value).toLowerCase().includes(lowerSearch)
      );
    }
    
    // Then sort: numeric if all values are numeric, otherwise alphabetic
    const sortedValues = [...values];
    
    // Check if all values are numeric
    const allNumeric = sortedValues.every(v => {
      const num = Number(v);
      return !isNaN(num) && isFinite(num);
    });
    
    if (allNumeric) {
      // Numeric sort
      sortedValues.sort((a, b) => Number(a) - Number(b));
    } else {
      // Alphabetic sort
      sortedValues.sort((a, b) => {
        const strA = String(a);
        const strB = String(b);
        return strA.localeCompare(strB);
      });
    }
    
    return sortedValues;
  }, [metadata.availableValues, searchTerm]);

  const handleToggle = (value: any) => {
    const currentIndex = selectedValues.indexOf(value);
    const newSelected = [...selectedValues];

    if (currentIndex === -1) {
      newSelected.push(value);
    } else {
      newSelected.splice(currentIndex, 1);
    }

    onChange(newSelected);
  };

  const handleSelectAll = () => {
    onChange([...filteredValues]);
  };

  const handleDeselectAll = () => {
    // Remove all filtered values from selection
    const filteredSet = new Set(filteredValues);
    const newSelected = selectedValues.filter(v => !filteredSet.has(v));
    onChange(newSelected);
  };

  if (metadata.loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={20} />
        <Typography variant="caption" sx={{ ml: 1 }}>
          Loading values...
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

  if (metadata.availableValues.length === 0) {
    return (
      <Box className={styles.container}>
        <Typography variant="caption" color="textSecondary">
          No values available
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={styles.container}>
      {/* Search field */}
      {metadata.availableValues.length > 10 && (
        <TextField
          size="small"
          placeholder="Search values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          sx={{ mb: 1 }}
        />
      )}

      {/* Select/Deselect All buttons */}
      <Box className={styles.buttonGroup}>
        <Button 
          size="small" 
          onClick={handleSelectAll}
          variant="text"
        >
          Select All
        </Button>
        <Button 
          size="small" 
          onClick={handleDeselectAll}
          variant="text"
        >
          Deselect All
        </Button>
      </Box>

      {/* Checkbox list */}
      <Box className={styles.checkboxList}>
        {filteredValues.map((value, index) => {
          const valueStr = String(value);
          const isChecked = selectedValues.includes(value);
          
          return (
            <FormControlLabel
              key={`${valueStr}-${index}`}
              control={
                <Checkbox
                  checked={isChecked}
                  onChange={() => handleToggle(value)}
                  size="small"
                />
              }
              label={valueStr}
              className={styles.checkboxItem}
            />
          );
        })}
      </Box>

      {/* Selection summary */}
      <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
        {selectedValues.length} of {metadata.availableValues.length} selected
      </Typography>
    </Box>
  );
};

export default DiscreteFilterControl;


