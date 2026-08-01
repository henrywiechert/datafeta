// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Button, 
  Box, 
  TextField,
  CircularProgress,
  Typography,
  Alert,
  FormControlLabel,
  Switch
} from '@mui/material';
import { DiscreteFilterMatchMode, DiscreteFilterMetadata, DiscretePatternOperator, DiscreteValueListMode } from '../../../types';
import { filterValueKey } from '../../../utils/filterValueKey';
import styles from './DiscreteFilterControl.module.css';
import type { FilterValueListFetchOptions } from '../../../hooks/useFilterMetadata';

const LOADING_OVERLAY_DELAY_MS = 400;

interface DiscreteFilterControlProps {
  metadata: DiscreteFilterMetadata;
  selectedValues: any[];
  matchMode?: DiscreteFilterMatchMode;
  pattern?: string;
  patternOperator?: DiscretePatternOperator;
  isInversePattern?: boolean;
  valueListMode?: DiscreteValueListMode;
  onChange: (selectedValues: any[]) => void;
  onPatternChange: (config: {
    matchMode: DiscreteFilterMatchMode;
    pattern: string;
    patternOperator: DiscretePatternOperator;
    isInversePattern: boolean;
  }) => void;
  onValueListModeChange?: (mode: DiscreteValueListMode) => void;
  onRefetchValues: (
    regexPattern?: string,
    options?: FilterValueListFetchOptions,
  ) => Promise<void>;
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
  matchMode = 'selection',
  pattern = '',
  patternOperator = 'like',
  isInversePattern = false,
  valueListMode = 'all',
  onChange,
  onPatternChange,
  onValueListModeChange,
  onRefetchValues,
}) => {
  const [listFilterTerm, setListFilterTerm] = useState('');
  const [queryRegex, setQueryRegex] = useState(metadata.appliedRegexQuery || '');
  const [useRegex, setUseRegex] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDelayedLoading, setShowDelayedLoading] = useState(false);
  const isPatternMode = matchMode === 'pattern';
  const hasCachedValues = metadata.availableValues.length > 0;

  // Keep the list visible during All/Relevant refetch; only show overlay if slow.
  useEffect(() => {
    if (!metadata.loading || !hasCachedValues) {
      setShowDelayedLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowDelayedLoading(true);
    }, LOADING_OVERLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [metadata.loading, hasCachedValues]);

  // ---- Selection matching ----
  // After loading a saved config, selectedValues may be numbers while availableValues
  // come back as strings (or vice versa), depending on backend/driver. Strict equality
  // would fail and nothing would appear checked even though the filter is active.
  // Datetime values may also differ in separator ('T' vs space) between API and chart domain.
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
    () => new Set(selectedValues.map(filterValueKey)),
    [selectedValues]
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

  // Partition into selected and unselected values. Selected values stay pinned only
  // when no local search is active; once the user types a search, both groups should
  // respect that filter so "all selected" still narrows the rendered list.
  const { pinnedValues, unpinnedValues } = useMemo(() => {
    const selected: any[] = [];
    const unselected: any[] = [];
    for (const value of metadata.availableValues) {
      if (selectedKeysSet.has(filterValueKey(value))) {
        selected.push(value);
      } else {
        unselected.push(value);
      }
    }

    const term = listFilterTerm.trim();
    const hasSearch = term.length > 0;
    setRegexError(null);
    const matchesSearch = (value: any) => {
      const displayValue = value === null || value === undefined ? '(null)' : String(value);
      if (!hasSearch) return true;
      if (useRegex) {
        try {
          const re = new RegExp(term);
          return re.test(displayValue);
        } catch (e: any) {
          setRegexError(e?.message || 'Invalid regex');
          return true;
        }
      }

      return displayValue.toLowerCase().includes(term.toLowerCase());
    };

    const filteredSelected = hasSearch ? selected.filter(matchesSearch) : selected;
    const filteredUnselected = unselected.filter(matchesSearch);

    return {
      pinnedValues: sortValues(filteredSelected),
      unpinnedValues: sortValues(filteredUnselected),
    };
  }, [metadata.availableValues, selectedKeysSet, listFilterTerm, useRegex, sortValues]);

  // Combined list for master select/deselect (Excel-style header checkbox)
  const allVisibleValues = useMemo(
    () => [...pinnedValues, ...unpinnedValues],
    [pinnedValues, unpinnedValues]
  );

  const visibleSelectionState = useMemo(() => {
    if (allVisibleValues.length === 0) {
      return { allSelected: false, someSelected: false };
    }
    let selectedCount = 0;
    for (const value of allVisibleValues) {
      if (selectedKeysSet.has(filterValueKey(value))) {
        selectedCount += 1;
      }
    }
    return {
      allSelected: selectedCount === allVisibleValues.length,
      someSelected: selectedCount > 0 && selectedCount < allVisibleValues.length,
    };
  }, [allVisibleValues, selectedKeysSet]);

  // Memoize the toggle handler to prevent unnecessary re-renders of child components
  const handleToggle = useCallback((value: any) => {
    const key = filterValueKey(value);
    const normalizedValue = normalizeValueForSelection(value);

    if (selectedKeysSet.has(key)) {
      // Remove all entries that match by key (handles "1" vs 1, etc.)
      onChange(selectedValues.filter((v) => filterValueKey(v) !== key));
    } else {
      onChange([...selectedValues, normalizedValue]);
    }
  }, [selectedValues, selectedKeysSet, onChange, normalizeValueForSelection]);

  const handleToggleSelectAll = useCallback(() => {
    if (visibleSelectionState.allSelected) {
      const visibleKeySet = new Set(allVisibleValues.map(filterValueKey));
      onChange(selectedValues.filter((v) => !visibleKeySet.has(filterValueKey(v))));
      return;
    }
    onChange(allVisibleValues.map(normalizeValueForSelection));
  }, [
    visibleSelectionState.allSelected,
    allVisibleValues,
    selectedValues,
    onChange,
    normalizeValueForSelection,
  ]);

  const handleInvertSelection = useCallback(() => {
    const visibleKeySet = new Set(allVisibleValues.map(filterValueKey));
    const kept = selectedValues.filter((v) => !visibleKeySet.has(filterValueKey(v)));
    const newlySelected = allVisibleValues
      .filter((v) => !selectedKeysSet.has(filterValueKey(v)))
      .map(normalizeValueForSelection);
    onChange([...kept, ...newlySelected]);
  }, [allVisibleValues, selectedValues, selectedKeysSet, onChange, normalizeValueForSelection]);

  const updatePatternConfig = useCallback((updates: Partial<{
    matchMode: DiscreteFilterMatchMode;
    pattern: string;
    patternOperator: DiscretePatternOperator;
    isInversePattern: boolean;
  }>) => {
    onPatternChange({
      matchMode,
      pattern,
      patternOperator,
      isInversePattern,
      ...updates,
    });
  }, [matchMode, pattern, patternOperator, isInversePattern, onPatternChange]);
  
  // Handle query regex update (backend filter) — rewrite selection from result.
  const handleQueryRegexUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onRefetchValues(queryRegex.trim() || undefined, {
        applySelectionFromResult: true,
      });
    } catch (error) {
      console.error('Error refetching values:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Initial load only — keep existing values visible during All/Relevant refetch.
  if (metadata.loading && !hasCachedValues) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={20} />
        <Typography variant="caption" sx={{ ml: 1 }}>
          Loading values...
        </Typography>
      </Box>
    );
  }

  if (metadata.error && !hasCachedValues) {
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
      {showDelayedLoading && (
        <Box className={styles.loadingOverlay} aria-live="polite">
          <CircularProgress size={16} />
          <Typography variant="caption">Updating values…</Typography>
        </Box>
      )}
      {/* A refresh failed but we still have a usable list — say so instead of blanking out */}
      {metadata.error && (
        <Alert severity="error" sx={{ mb: 1, fontSize: '12px', padding: '4px 8px' }}>
          Could not refresh values: {metadata.error}
        </Alert>
      )}
      {/* Warning message for partial results */}
      {metadata.isPartial && metadata.warningMessage && (
        <Alert severity="warning" sx={{ mb: 1, fontSize: '12px', padding: '4px 8px' }}>
          {metadata.warningMessage}
        </Alert>
      )}

      {/* Pattern mode is only worth offering when the list is sampled and the picker
          alone cannot reach every value. A filter already in pattern mode keeps the
          switcher so a saved config stays editable on a small column. */}
      {(metadata.isPartial || isPatternMode) && (
        <Box className={styles.modeSwitcher}>
          <Button
            size="small"
            variant={isPatternMode ? 'text' : 'contained'}
            onClick={() => updatePatternConfig({ matchMode: 'selection' })}
          >
            Selection
          </Button>
          <Button
            size="small"
            variant={isPatternMode ? 'contained' : 'text'}
            onClick={() => updatePatternConfig({ matchMode: 'pattern' })}
          >
            Pattern
          </Button>
        </Box>
      )}

      {onValueListModeChange && (
        <Box className={styles.valueListSwitcher}>
          <Button
            size="small"
            variant={valueListMode === 'all' ? 'contained' : 'text'}
            onClick={() => onValueListModeChange('all')}
          >
            All
          </Button>
          <Button
            size="small"
            variant={valueListMode === 'relevant' ? 'contained' : 'text'}
            onClick={() => onValueListModeChange('relevant')}
          >
            Relevant
          </Button>
        </Box>
      )}

      {isPatternMode && (
        <Box className={styles.patternPanel}>
          <TextField
            size="small"
            variant="outlined"
            label="Pattern"
            placeholder="%value%"
            value={pattern}
            onChange={(e) => updatePatternConfig({ pattern: e.target.value })}
            fullWidth
            helperText="Uses SQL LIKE syntax. Examples: %mid%, prefix%, %suffix"
          />
          <Box className={styles.patternToggleRow}>
            <Button
              size="small"
              variant={patternOperator === 'like' ? 'contained' : 'text'}
              onClick={() => updatePatternConfig({ patternOperator: 'like' })}
            >
              Case-Sensitive
            </Button>
            <Button
              size="small"
              variant={patternOperator === 'ilike' ? 'contained' : 'text'}
              onClick={() => updatePatternConfig({ patternOperator: 'ilike' })}
            >
              Case-Insensitive
            </Button>
          </Box>
          <FormControlLabel
            className={styles.inverseToggle}
            control={
              <Switch
                size="small"
                checked={isInversePattern}
                onChange={(e) => updatePatternConfig({ isInversePattern: e.target.checked })}
              />
            }
            label={isInversePattern ? 'Exclude matches' : 'Keep matches'}
          />
          {metadata.isPartial && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onRefetchValues(pattern.trim() || undefined)}
              disabled={isUpdating}
            >
              Preview Matching Values
            </Button>
          )}
        </Box>
      )}
      
      {/* Query Regex - for backend filtering (only visible when partial or applied) */}
      {!isPatternMode && (metadata.isPartial || metadata.appliedRegexQuery) && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 500 }}>
            Pattern Preview (SQL LIKE filter):
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
      
      {/* Show message if no values in selection mode */}
      {hasNoValues && !metadata.isPartial && !isPatternMode && (
        <Box className={styles.container}>
          <Typography variant="caption" color="textSecondary">
            No values available
          </Typography>
        </Box>
      )}
      
      {/* Only show filter controls if we have values */}
      {!isPatternMode && !hasNoValues && (
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

        {/* Master select + invert + regex */}
        <Box className={styles.buttonGroup}>
          <Box className={styles.selectActions}>
            <label className={styles.selectAllItem}>
              <input
                type="checkbox"
                className={styles.nativeCheckbox}
                checked={visibleSelectionState.allSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = visibleSelectionState.someSelected;
                  }
                }}
                onChange={handleToggleSelectAll}
                disabled={allVisibleValues.length === 0}
                aria-label={
                  visibleSelectionState.allSelected ? 'Select none' : 'Select all'
                }
              />
              <span className={styles.selectAllLabel}>
                {visibleSelectionState.allSelected ? 'None' : 'All'}
              </span>
            </label>
            <Button
              size="small"
              variant="text"
              onClick={handleInvertSelection}
              disabled={allVisibleValues.length === 0}
              className={styles.invertButton}
            >
              Invert
            </Button>
          </Box>
          <Button
            size="small"
            variant="text"
            color="primary"
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
          const isChecked = selectedKeysSet.has(filterValueKey(value));
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
          const isChecked = selectedKeysSet.has(filterValueKey(value));
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

      {isPatternMode && pattern && (
        <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
          {isInversePattern ? 'Excluding values that match this pattern.' : 'Keeping values that match this pattern.'}
        </Typography>
      )}
    </Box>
  );
};

export default DiscreteFilterControl;


