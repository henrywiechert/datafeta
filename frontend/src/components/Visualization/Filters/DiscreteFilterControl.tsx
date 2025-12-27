import React, { useState, useMemo, useCallback } from 'react';
import { 
  Button, 
  Box, 
  TextField,
  CircularProgress,
  Typography,
  Alert
} from '@mui/material';
import { DiscreteFilterMetadata } from '../../../types';
import styles from './DiscreteFilterControl.module.css';

interface DiscreteFilterControlProps {
  metadata: DiscreteFilterMetadata;
  selectedValues: any[];
  onChange: (selectedValues: any[]) => void;
  onRefetchValues: (regexPattern?: string) => Promise<void>;
}

// Memoized checkbox item to prevent unnecessary re-renders
// Each checkbox only re-renders when its own checked state changes
interface CheckboxItemProps {
  value: any;
  valueStr: string;
  isChecked: boolean;
  onToggle: (value: any) => void;
}

const CheckboxItem = React.memo<CheckboxItemProps>(({ value, valueStr, isChecked, onToggle }) => {
  const handleChange = useCallback(() => {
    onToggle(value);
  }, [value, onToggle]);

  return (
    <label className={styles.checkboxItem}>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={handleChange}
        className={styles.nativeCheckbox}
      />
      <span className={styles.checkboxLabel}>{valueStr}</span>
    </label>
  );
});

const DiscreteFilterControl: React.FC<DiscreteFilterControlProps> = ({
  metadata,
  selectedValues,
  onChange,
  onRefetchValues,
}) => {
  const [listFilterTerm, setListFilterTerm] = useState('');
  const [queryRegex, setQueryRegex] = useState(metadata.appliedRegexQuery || '');
  const [useRegex, setUseRegex] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sort and filter available values based on list filter term (client-side)
  const filteredValues = useMemo(() => {
    // First, filter based on list filter term (plain or regex)
    let values = metadata.availableValues;
    const term = listFilterTerm.trim();
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
  }, [metadata.availableValues, listFilterTerm, useRegex]);

  // Also recompute when regex mode toggles to keep list in sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredValuesWithRegex = filteredValues; // alias for readability

  // ---- Selection matching ----
  // After loading a saved config, selectedValues may be numbers while availableValues
  // come back as strings (or vice versa), depending on backend/driver. Strict equality
  // would fail and nothing would appear checked even though the filter is active.
  const valueKey = useCallback((v: any) => {
    if (v === null || v === undefined) return '__NULL__';
    return String(v);
  }, []);

  const selectionPrefersNumber = useMemo(
    () => selectedValues.some((v) => typeof v === 'number'),
    [selectedValues]
  );

  const normalizeValueForSelection = useCallback((v: any) => {
    if (v === null || v === undefined) return v;
    if (selectionPrefersNumber && typeof v === 'string') {
      const n = Number(v);
      if (!Number.isNaN(n) && Number.isFinite(n)) return n;
    }
    return v;
  }, [selectionPrefersNumber]);

  // O(1) lookup by canonical key (stringified)
  const selectedKeysSet = useMemo(
    () => new Set(selectedValues.map(valueKey)),
    [selectedValues, valueKey]
  );

  // Memoize the toggle handler to prevent unnecessary re-renders of child components
  const handleToggle = useCallback((value: any) => {
    const key = valueKey(value);
    const normalizedValue = normalizeValueForSelection(value);

    if (selectedKeysSet.has(key)) {
      // Remove all entries that match by key (handles "1" vs 1, etc.)
      onChange(selectedValues.filter((v) => valueKey(v) !== key));
    } else {
      onChange([...selectedValues, normalizedValue]);
    }
  }, [selectedValues, selectedKeysSet, onChange, valueKey, normalizeValueForSelection]);

  const handleSelectAll = () => {
    onChange(filteredValuesWithRegex.map(normalizeValueForSelection));
  };

  const handleDeselectAll = () => {
    // Remove all filtered values from selection
    const filteredKeySet = new Set(filteredValuesWithRegex.map(valueKey));
    const newSelected = selectedValues.filter((v) => !filteredKeySet.has(valueKey(v)));
    onChange(newSelected);
  };
  
  // Handle query regex update (backend filter)
  const handleQueryRegexUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onRefetchValues(queryRegex.trim() || undefined);
    } catch (error) {
      console.error('Error refetching values:', error);
    } finally {
      setIsUpdating(false);
    }
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

  // Don't return early for 0 values if we have Query Regex capability
  // (so user can refine their pattern)
  const hasNoValues = metadata.availableValues.length === 0;

  return (
    <Box className={styles.container}>
      {/* Warning message for partial results */}
      {metadata.isPartial && metadata.warningMessage && (
        <Alert severity="warning" sx={{ mb: 1, fontSize: '12px', padding: '4px 8px' }}>
          {metadata.warningMessage}
        </Alert>
      )}
      
      {/* Query Regex - for backend filtering (only visible when partial or applied) */}
      {(metadata.isPartial || metadata.appliedRegexQuery) && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 500 }}>
            Query Regex (SQL LIKE filter):
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              variant="outlined"
              placeholder="Enter pattern..."
              value={queryRegex}
              onChange={(e) => setQueryRegex(e.target.value)}
              fullWidth
              disabled={isUpdating}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleQueryRegexUpdate}
              disabled={isUpdating || !queryRegex.trim()}
            >
              {isUpdating ? <CircularProgress size={16} /> : 'Update'}
            </Button>
          </Box>
        </Box>
      )}
      
      {/* Show message if no values (but still allow Query Regex above to be used) */}
      {hasNoValues && !metadata.isPartial && (
        <Box className={styles.container}>
          <Typography variant="caption" color="textSecondary">
            No values available
          </Typography>
        </Box>
      )}
      
      {/* Only show filter controls if we have values */}
      {!hasNoValues && (
      <Box className={styles.filterBox}>
        {/* List Filter - for client-side filtering of loaded values */}
        {metadata.availableValues.length > 10 && (
          <Box className={`${styles.searchRow} ${styles.searchHeader}`}>
            <TextField
              className={styles.searchField}
              size="small"
              variant="outlined"
              placeholder={metadata.isPartial ? "Filter loaded values..." : "Search values..."}
              value={listFilterTerm}
              onChange={(e) => setListFilterTerm(e.target.value)}
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
          // O(1) lookup by key to handle saved-state type differences ("1" vs 1)
          const isChecked = selectedKeysSet.has(valueKey(value));
          
          return (
            <CheckboxItem
              key={`${valueStr}-${index}`}
              value={value}
              valueStr={valueStr}
              isChecked={isChecked}
              onToggle={handleToggle}
            />
          );
        })}
      </Box>
      
      {/* Selection summary */}
      <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
        {selectedValues.length} of {metadata.availableValues.length} selected
      </Typography>
      </Box>
      )}
    </Box>
  );
};

export default DiscreteFilterControl;


