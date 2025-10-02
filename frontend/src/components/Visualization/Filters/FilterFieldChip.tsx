import React, { useState } from 'react';
import { Chip, Box, IconButton, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import { Field, FilterConfig, FilterMetadata } from '../../../types';
import DiscreteFilterControl from './DiscreteFilterControl';
import ContinuousFilterControl from './ContinuousFilterControl';
import DateTimeFilterControl from './DateTimeFilterControl';
import styles from './FilterFieldChip.module.css';

interface FilterFieldChipProps {
  field: Field;
  filterConfig: FilterConfig | undefined;
  filterMetadata: FilterMetadata | undefined;
  onConfigChange: (config: FilterConfig) => void;
  onRemove: () => void;
}

const FilterFieldChip: React.FC<FilterFieldChipProps> = ({
  field,
  filterConfig,
  filterMetadata,
  onConfigChange,
  onRemove,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  // Determine filter type based on field characteristics
  const getFilterType = (): 'discrete' | 'continuous' | 'datetime' => {
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
          onChange={(values) => {
            onConfigChange({
              fieldId: field.id,
              columnName: field.columnName,
              type: 'discrete',
              selectedValues: values,
            });
          }}
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
          onChange={(newMin, newMax) => {
            onConfigChange({
              fieldId: field.id,
              columnName: field.columnName,
              type: 'continuous',
              min: newMin,
              max: newMax,
            });
          }}
        />
      );
    }

    if (filterType === 'datetime' && filterMetadata.type === 'datetime') {
      const startDate = filterConfig && filterConfig.type === 'datetime' ? filterConfig.startDate : null;
      const endDate = filterConfig && filterConfig.type === 'datetime' ? filterConfig.endDate : null;

      return (
        <DateTimeFilterControl
          metadata={filterMetadata}
          startDate={startDate}
          endDate={endDate}
          onChange={(newStart, newEnd) => {
            onConfigChange({
              fieldId: field.id,
              columnName: field.columnName,
              type: 'datetime',
              startDate: newStart,
              endDate: newEnd,
            });
          }}
        />
      );
    }

    return null;
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
        return `${field.columnName} [${filterConfig.min ?? '∞'} - ${filterConfig.max ?? '∞'}]`;
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

  return (
    <Box className={styles.container}>
      <Box className={styles.chipContainer}>
        <Chip
          label={getSummaryText()}
          size="small"
          onDelete={onRemove}
          deleteIcon={<CloseIcon />}
          className={styles.chip}
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


