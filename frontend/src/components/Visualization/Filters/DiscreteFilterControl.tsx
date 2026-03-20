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

  // ---- Selection matching ----
  // After loading a saved config, selectedValues may be numbers while availableValues
  // come back as strings (or vice versa), depending on backend/driver. Strict equality
  // would fail and nothing would appear checked even though the filter is active.
  // Datetime values may also differ in separator ('T' vs space) between API and chart domain.
  const valueKey = useCallback((v: any) => {
    if (v === null || v === undefined) return '__NULL__';
    const s = String(v);
    // Normalize ISO datetime separator: "2024-01-15T14:30:00" → "2024-01-15 14:30:00"
    if (s.length >= 19 && s[10] === 'T' && s[4] === '-' && s[13] === ':') {
      return s.replace('T', ' ');
    }
    return s;
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

  // Sort helper: numeric if all non-null values are numeric, otherwise alphabetic
  const sortValues = useCallback((values: any[]) => {
    const sorted = [...values];
    const nonNull = sorted.filter(v => v !== null && v !== undefined);
    const allNumeric = nonNull.length > 0 && nonNull.every(v => {
      const num = Number(v);
      return !isNaN(num) && isFinite(num);
    });
    if (allNumeric) {
      sorted.sort((a, b) => {
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        return Number(a) - Number(b);
      });
    } else {
      sorted.sort((a, b) => {
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        return String(a).localeCompare(String(b));
      });
    }
    return sorted;
  }, []);

  // Partition into selected (always visible) and unselected (filtered by search),
  // then sort each group independently.
  const { pinnedValues, unpinnedValues } = useMemo(() => {
    const selected: any[] = [];
    const unselected: any[] = [];
    for (const value of metadata.availableValues) {
      if (selectedKeysSet.has(valueKey(value))) {
        selected.push(value);
      } else {
        unselected.push(value);
      }
    }

    // Apply search filter only to unselected values
    let filteredUnselected = unselected;
    const term = listFilterTerm.trim();
    setRegexError(null);
    if (term) {
      if (useRegex) {
        try {
          const re = new RegExp(term);
          filteredUnselected = unselected.filter(value => {
            const displayValue = value === null || value === undefined ? '(null)' : String(value);
            return re.test(displayValue);
          });
        } catch (e: any) {
          setRegexError(e?.message || 'Invalid regex');
        }
      } else {
        const lowerSearch = term.toLowerCase();
        filteredUnselected = unselected.filter(value => {
          const displayValue = value === null || value === undefined ? '(null)' : String(value);
          return displayValue.toLowerCase().includes(lowerSearch);
        });
      }
    }

    return {
      pinnedValues: sortValues(selected),
      unpinnedValues: sortValues(filteredUnselected),
    };
  }, [metadata.availableValues, selectedKeysSet, valueKey, listFilterTerm, useRegex, sortValues]);

  // Combined list for Select All / Deselect All operations
  const allVisibleValues = useMemo(
    () => [...pinnedValues, ...unpinnedValues],
    [pinnedValues, unpinnedValues]
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
    onChange(allVisibleValues.map(normalizeValueForSelection));
  };

  const handleDeselectAll = () => {
    const visibleKeySet = new Set(allVisibleValues.map(valueKey));
    const newSelected = selectedValues.filter((v) => !visibleKeySet.has(valueKey(v)));
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

      {/* Checkbox list: selected values pinned on top */}
      <Box className={styles.checkboxList}>
        {pinnedValues.map((value, index) => {
          const valueStr = value === null || value === undefined ? '(null)' : String(value);
          const isChecked = selectedKeysSet.has(valueKey(value));
          return (
            <CheckboxItem
              key={`pinned-${valueStr}-${index}`}
              value={value}
              valueStr={valueStr}
              isChecked={isChecked}
              onToggle={handleToggle}
            />
          );
        })}
        {pinnedValues.length > 0 && unpinnedValues.length > 0 && (
          <div className={styles.sectionDivider} />
        )}
        {unpinnedValues.map((value, index) => {
          const valueStr = value === null || value === undefined ? '(null)' : String(value);
          const isChecked = selectedKeysSet.has(valueKey(value));
          return (
            <CheckboxItem
              key={`unpinned-${valueStr}-${index}`}
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


