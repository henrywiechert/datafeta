import React, { useState, useCallback } from 'react';
import { Box, IconButton, Collapse, Tooltip, ToggleButton, Menu, MenuItem, Divider } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PublicIcon from '@mui/icons-material/Public';
import DescriptionIcon from '@mui/icons-material/Description';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Field, FilterConfig, FilterMetadata, FilterScope } from '../../../types';
import DiscreteFilterControl from './DiscreteFilterControl';
import ContinuousFilterControl from './ContinuousFilterControl';
import { DateTimeRangeFilter } from '../../DateTime';
import styles from './FilterFieldChip.module.css';
import FieldChip from '../FieldChip';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';

interface FilterFieldChipProps {
  field: Field;
  filterConfig: FilterConfig | undefined;
  filterMetadata: FilterMetadata | undefined;
  onConfigChange: (config: FilterConfig) => void;
  onRemove: () => void;
  onRefetchValues: (regexPattern?: string) => Promise<void>;
  // New: scope-related props
  filterScope?: FilterScope;
  onScopeChange?: (newScope: FilterScope) => void;
  // Disabled state
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
}

const FilterFieldChip: React.FC<FilterFieldChipProps> = ({
  field,
  filterConfig,
  filterMetadata,
  onConfigChange,
  onRemove,
  onRefetchValues,
  filterScope = 'sheet',
  onScopeChange,
  isDisabled = false,
  onToggleDisabled,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const { dispatch } = useVisualizationContext();
  
  const isSessionScope = filterScope === 'session';
  const isZoomFilter = !!filterConfig?.isZoomFilter;

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleToggleDisabled = () => {
    handleMenuClose();
    if (onToggleDisabled) onToggleDisabled();
  };

  const handleRemoveFromMenu = () => {
    handleMenuClose();
    onRemove();
  };
  
  const handleToggleScope = () => {
    if (onScopeChange) {
      const newScope: FilterScope = isSessionScope ? 'sheet' : 'session';
      onScopeChange(newScope);
      console.log(`🔧 Filter "${field.columnName}" scope changed to ${newScope}`);
    }
  };

  // Memoize these handlers to keep callbacks stable for child components (CheckboxItem memoization)
  const handleDiscreteChange = useCallback((values: any[]) => {
    // Compute excludedValues for query optimization (NOT IN when shorter than IN)
    let excludedValues: any[] | undefined;
    let totalAvailableCount: number | undefined;
    if (filterMetadata && filterMetadata.type === 'discrete' && !filterMetadata.isPartial) {
      const available = filterMetadata.availableValues;
      totalAvailableCount = available.length;
      const selectedKeySet = new Set(values.map(v => v === null || v === undefined ? '__NULL__' : String(v)));
      const excluded = available.filter(v => !selectedKeySet.has(v === null || v === undefined ? '__NULL__' : String(v)));
      // Only store excludedValues when it would actually be shorter
      if (excluded.length > 0 && excluded.length < values.length) {
        excludedValues = excluded;
      }
    }
    onConfigChange({
      fieldId: field.id,
      columnName: field.columnName,
      type: 'discrete',
      selectedValues: values,
      excludedValues,
      totalAvailableCount,
      dateTimePart: field.dateTimePart,
      dateTimeMode: field.dateTimeMode,
      isZoomFilter: filterConfig?.isZoomFilter,
    });
  }, [field.id, field.columnName, field.dateTimePart, field.dateTimeMode, onConfigChange, filterMetadata, filterConfig?.isZoomFilter]);

  const handleContinuousChange = useCallback((newMin: number | null, newMax: number | null) => {
    onConfigChange({
      fieldId: field.id,
      columnName: field.columnName,
      type: 'continuous',
      min: newMin,
      max: newMax,
      isZoomFilter: filterConfig?.isZoomFilter,
    });
  }, [field.id, field.columnName, onConfigChange, filterConfig?.isZoomFilter]);

  const handleDateTimeChange = useCallback((startDate: string | null, endDate: string | null) => {
    onConfigChange({
      fieldId: field.id,
      columnName: field.columnName,
      type: 'datetime',
      startDate,
      endDate,
      isZoomFilter: filterConfig?.isZoomFilter,
    });
  }, [field.id, field.columnName, onConfigChange, filterConfig?.isZoomFilter]);

  // Determine filter type based on field characteristics
  const getFilterType = (): 'discrete' | 'continuous' | 'datetime' => {
    // Datetime parts with discrete flavour or distinct mode → discrete filter (checkbox list)
    if (field.dataType === 'datetime' && field.dateTimePart &&
        (field.dateTimeMode === 'distinct' || field.flavour === 'discrete')) {
      return 'discrete';
    }
    // Full datetime OR continuous timeline parts → datetime range filter
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
      // Pure exclusion mode: selectedValues empty but excludedValues set
      if (
        filterConfig.selectedValues.length === 0
        && filterConfig.excludedValues
        && filterConfig.excludedValues.length > 0
      ) {
        return `${field.columnName} (excluding ${filterConfig.excludedValues.length})`;
      }
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
  // Note: styling is now handled by unified FieldChip; keep FilterFieldChip.module.css
  // for container/expand UI only.

  const scopeTooltip = isZoomFilter
    ? (isSessionScope
        ? "Zoom filter – session scope (applies to all sheets)"
        : "Zoom filter – sheet scope (applies to this sheet only)")
    : (isSessionScope
        ? "Session filter (applies to all sheets)"
        : "Sheet filter (applies to this sheet only)");

  const scopeIcon = isZoomFilter
    ? <ZoomInIcon sx={{ fontSize: 14 }} />
    : (isSessionScope ? <PublicIcon sx={{ fontSize: 14 }} /> : <DescriptionIcon sx={{ fontSize: 14 }} />);

  return (
    <Box className={`${styles.container}${isDisabled ? ` ${styles.disabled}` : ''}`}>
      <Box className={styles.chipContainer}>
        <Tooltip title={scopeTooltip} placement="top" arrow>
          <ToggleButton
            value="session"
            selected={isSessionScope}
            onChange={handleToggleScope}
            size="small"
            disabled={!onScopeChange}
            sx={{
              padding: '2px',
              minWidth: '24px',
              height: '24px',
              marginRight: '4px',
              border: 'none',
              '&.Mui-selected': {
                backgroundColor: 'secondary.light',
                color: 'secondary.contrastText',
                '&:hover': {
                  backgroundColor: 'secondary.main',
                },
              },
            }}
          >
            {scopeIcon}
          </ToggleButton>
        </Tooltip>
        <Box className={`${styles.chipCell}${isDisabled ? ` ${styles.chipCellDisabled}` : ''}`}>
          <FieldChip
            field={field}
            source="FILTER_ZONE"
            displayNameOverride={getSummaryText()}
            onUpdate={(updated) => {
              const f = Array.isArray(updated) ? updated[0] : updated;
              dispatch({ type: 'UPDATE_FIELD', payload: f });
            }}
            onRemoveFromZone={() => onRemove()}
          />
        </Box>
        <Tooltip title="Filter options" placement="top" arrow>
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            className={styles.menuButton}
          >
            <MoreVertIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={handleToggleExpand}
          className={styles.expandButton}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem onClick={handleToggleDisabled} disabled={!onToggleDisabled}>
          {isDisabled ? 'Enable on this sheet' : 'Disable on this sheet'}
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleRemoveFromMenu} sx={{ color: 'error.main' }}>
          Remove
        </MenuItem>
      </Menu>

      <Collapse in={expanded}>
        <Box className={styles.controlContainer}>
          {renderFilterControl()}
        </Box>
      </Collapse>
    </Box>
  );
};

export default FilterFieldChip;


