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
  const [useRegex, setUseRegex] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);

  // Sort and filter available values based on search term
  const filteredValues = useMemo(() => {
    // First, filter based on search term (plain or regex)
    let values = metadata.availableValues;
    const term = searchTerm.trim();
    setRegexError(null);
    if (term) {
      if (useRegex) {
        try {
          const re = new RegExp(term);
          values = values.filter(value => {
            // Handle null/undefined values
            const displayValue = value === null || value === undefined ? '(null)' : String(value);
            return re.test(displayValue);
          });
        } catch (e: any) {
          // invalid regex → don't filter further, surface error
          setRegexError(e?.message || 'Invalid regex');
        }
      } else {
        const lowerSearch = term.toLowerCase();
        values = values.filter(value => {
          // Handle null/undefined values
          const displayValue = value === null || value === undefined ? '(null)' : String(value);
          return displayValue.toLowerCase().includes(lowerSearch);
        });
      }
    }
    
    // Then sort: numeric if all values are numeric (excluding nulls), otherwise alphabetic
    const sortedValues = [...values];
    
    // Check if all non-null values are numeric
    const nonNullValues = sortedValues.filter(v => v !== null && v !== undefined);
    const allNumeric = nonNullValues.length > 0 && nonNullValues.every(v => {
      const num = Number(v);
      return !isNaN(num) && isFinite(num);
    });
    
    if (allNumeric) {
      // Numeric sort - put nulls at the end
      sortedValues.sort((a, b) => {
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        return Number(a) - Number(b);
      });
    } else {
      // Alphabetic sort - put nulls at the end
      sortedValues.sort((a, b) => {
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        const strA = String(a);
        const strB = String(b);
        return strA.localeCompare(strB);
      });
    }
    
    return sortedValues;
  }, [metadata.availableValues, searchTerm, useRegex]);

  // Also recompute when regex mode toggles to keep list in sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredValuesWithRegex = filteredValues; // alias for readability

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
    onChange([...filteredValuesWithRegex]);
  };

  const handleDeselectAll = () => {
    // Remove all filtered values from selection
    const filteredSet = new Set(filteredValuesWithRegex);
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
      <Box className={styles.filterBox}>
        {/* Search row inside header to align frames */}
        {metadata.availableValues.length > 10 && (
          <Box className={`${styles.searchRow} ${styles.searchHeader}`}>
            <TextField
              className={styles.searchField}
              size="small"
              variant="outlined"
              placeholder="Search values..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              fullWidth
              error={!!regexError}
              helperText={regexError || ''}
            />
          </Box>
        )}

        {/* Select/Deselect All buttons */}
        <Box className={styles.buttonGroup}>
        <Box className={styles.leftButtons}>
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
        <Button
          size="small"
          variant="text"
          color={useRegex ? 'primary' : 'inherit'}
          className={`${styles.regexToggle} ${styles.regexRight} ${useRegex ? styles.toggleActive : ''}`}
          aria-pressed={useRegex}
          onClick={() => setUseRegex(!useRegex)}
        >
          Regex
        </Button>
      </Box>

      {/* Checkbox list */}
      <Box className={styles.checkboxList}>
        {filteredValuesWithRegex.map((value, index) => {
          // Display null/undefined values as "(null)"
          const valueStr = value === null || value === undefined ? '(null)' : String(value);
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
      </Box>

      {/* Selection summary */}
      <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
        {selectedValues.length} of {metadata.availableValues.length} selected
      </Typography>
    </Box>
  );
};

export default DiscreteFilterControl;


