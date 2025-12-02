import React, { useState, useCallback } from 'react';
import { Chip, Box, IconButton, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import { Field, FilterConfig, FilterMetadata } from '../../../types';
import DiscreteFilterControl from './DiscreteFilterControl';
import ContinuousFilterControl from './ContinuousFilterControl';
import { DateTimeRangeFilter } from '../../DateTime';
import styles from './FilterFieldChip.module.css';

interface FilterFieldChipProps {
  field: Field;
  filterConfig: FilterConfig | undefined;
  filterMetadata: FilterMetadata | undefined;
  onConfigChange: (config: FilterConfig) => void;
  onRemove: () => void;
  onRefetchValues: (regexPattern?: string) => Promise<void>;
}

const FilterFieldChip: React.FC<FilterFieldChipProps> = ({
  field,
  filterConfig,
  filterMetadata,
  onConfigChange,
  onRemove,
  onRefetchValues,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  // Memoize these handlers to keep callbacks stable for child components (CheckboxItem memoization)
  const handleDiscreteChange = useCallback((values: any[]) => {
    onConfigChange({
      fieldId: field.id,
      columnName: field.columnName,
      type: 'discrete',
      selectedValues: values,
      dateTimePart: field.dateTimePart,
      dateTimeMode: field.dateTimeMode,
    });
  }, [field.id, field.columnName, field.dateTimePart, field.dateTimeMode, onConfigChange]);

  const handleContinuousChange = useCallback((newMin: number | null, newMax: number | null) => {
    onConfigChange({
      fieldId: field.id,
      columnName: field.columnName,
      type: 'continuous',
      min: newMin,
      max: newMax,
    });
  }, [field.id, field.columnName, onConfigChange]);

  const handleDateTimeChange = useCallback((startDate: string | null, endDate: string | null) => {
    onConfigChange({
      fieldId: field.id,
      columnName: field.columnName,
      type: 'datetime',
      startDate,
      endDate,
    });
  }, [field.id, field.columnName, onConfigChange]);

  // Determine filter type based on field characteristics
  const getFilterType = (): 'discrete' | 'continuous' | 'datetime' => {
    // If it's a datetime field WITH a part specified, treat as discrete
    if (field.dataType === 'datetime' && field.dateTimePart && field.dateTimeMode) {
      return 'discrete';
    }
    // If it's a full datetime field (no part), treat as datetime
    if (field.dataType === 'datetime') {
      return 'datetime';
    }
    return field.flavour === 'discrete' ? 'discrete' : 'continuous';
  };

  const filterType = getFilterType();

  // Render the appropriate filter control based on type
  const renderFilterControl = () => {
    if (!filterMetadata) {
      return <div className={styles.loading}>Loading...</div>;
    }

    if (filterType === 'discrete' && filterMetadata.type === 'discrete') {
      const selectedValues = filterConfig && filterConfig.type === 'discrete' 
        ? filterConfig.selectedValues 
        : [];

      return (
        <DiscreteFilterControl
          metadata={filterMetadata}
          selectedValues={selectedValues}
          onChange={handleDiscreteChange}
          onRefetchValues={onRefetchValues}
        />
      );
    }

    if (filterType === 'continuous' && filterMetadata.type === 'continuous') {
      const min = filterConfig && filterConfig.type === 'continuous' ? filterConfig.min : null;
      const max = filterConfig && filterConfig.type === 'continuous' ? filterConfig.max : null;

      return (
        <ContinuousFilterControl
          metadata={filterMetadata}
          min={min}
          max={max}
          onChange={handleContinuousChange}
        />
      );
    }

    if (filterType === 'datetime' && filterMetadata.type === 'datetime') {
      const startDateTime = filterConfig && filterConfig.type === 'datetime' ? filterConfig.startDate : null;
      const endDateTime = filterConfig && filterConfig.type === 'datetime' ? filterConfig.endDate : null;

      return (
        <DateTimeRangeFilter
          metadata={filterMetadata}
          startDateTime={startDateTime}
          endDateTime={endDateTime}
          dateTimePart={field.dateTimePart}
          onChange={handleDateTimeChange}
        />
      );
    }

    return null;
  };

  // Format number for display (smart decimal places)
  const formatNumber = (value: number | null): string => {
    if (value === null) return '∞';
    
    // For very small or very large numbers, use exponential notation
    if (Math.abs(value) >= 1e6 || (Math.abs(value) < 0.001 && value !== 0)) {
      return value.toExponential(2);
    }
    
    // For integers or numbers very close to integers, show no decimals
    if (Math.abs(value - Math.round(value)) < 0.0001) {
      return Math.round(value).toString();
    }
    
    // For other numbers, show up to 3 significant decimal places
    // Remove trailing zeros
    return parseFloat(value.toPrecision(4)).toString();
  };

  // Get summary text for the chip
  const getSummaryText = () => {
    if (!filterConfig) return field.columnName;

    if (filterConfig.type === 'discrete') {
      const count = filterConfig.selectedValues.length;
      return `${field.columnName} (${count} selected)`;
    }

    if (filterConfig.type === 'continuous') {
      if (filterConfig.min !== null || filterConfig.max !== null) {
        const minStr = formatNumber(filterConfig.min);
        const maxStr = formatNumber(filterConfig.max);
        return `${field.columnName} [${minStr} - ${maxStr}]`;
      }
      return field.columnName;
    }

    if (filterConfig.type === 'datetime') {
      if (filterConfig.startDate || filterConfig.endDate) {
        return `${field.columnName} (filtered)`;
      }
      return field.columnName;
    }

    return field.columnName;
  };

  // Determine the chip class name based on field flavour
  const getChipClassName = () => {
    const baseClass = styles.chip;
    if (field.flavour === 'discrete') {
      return `${baseClass} ${styles.discrete}`;
    } else if (field.flavour === 'continuous') {
      return `${baseClass} ${styles.continuous}`;
    }
    return baseClass;
  };

  return (
    <Box className={styles.container}>
      <Box className={styles.chipContainer}>
        <Chip
          label={getSummaryText()}
          size="small"
          onDelete={onRemove}
          deleteIcon={<CloseIcon />}
          className={getChipClassName()}
        />
        <IconButton
          size="small"
          onClick={handleToggleExpand}
          className={styles.expandButton}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box className={styles.controlContainer}>
          {renderFilterControl()}
        </Box>
      </Collapse>
    </Box>
  );
};

export default FilterFieldChip;


