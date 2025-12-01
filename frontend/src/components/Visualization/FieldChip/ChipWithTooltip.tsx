import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Field } from '../../../types';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import styles from './FieldChip.module.css';
import { formatFullLabel } from './utils';
import { DragSource } from './types';
import FieldChipLabel from './FieldChipLabel';
import labelStyles from './FieldChipLabel.module.css';

interface ChipWithTooltipProps {
  field: Field;
  source: DragSource;
  onContextMenu: (event: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  isDragging: boolean;
  isSelected?: boolean;
  isInvalidOnAxis?: boolean;
  dragCount?: number; // Number of fields being dragged (for visual feedback)
}

const ChipWithTooltip: React.FC<ChipWithTooltipProps> = ({
  field,
  source,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onClick,
  onMouseDown,
  isDragging,
  isSelected = false,
  isInvalidOnAxis,
  dragCount
}) => {
  const chipLabelRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  // Function to check if text is truncated
  const checkTruncation = useCallback(() => {
    const el = chipLabelRef.current;
    if (el) {
      // Add small buffer (1px) to account for rounding errors
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      const isTextTruncated = scrollWidth > (clientWidth + 1);
      
      // Apply different truncation logic based on source
      if (source === 'AVAILABLE_FIELDS') {
        // For Fields area - only show tooltip when definitely truncated
        setIsTruncated(isTextTruncated && scrollWidth - clientWidth > 5); // More significant truncation
      } else {
        // For drop zones - show tooltip when there's any truncation
        setIsTruncated(isTextTruncated);
      }
    }
  }, [source]);

  const handleTooltipOpen = useCallback(() => {
    setTooltipOpen(true);
  }, []);

  const handleTooltipClose = useCallback(() => {
    setTooltipOpen(false);
  }, []);

  // Create a stable key for field properties to minimize re-renders
  const fieldPropertiesKey = useMemo(() => 
    `${field.columnName}|${field.aggregation || ''}|${field.flavour}|${field.dataType}|${field.dateTimePart || ''}|${field.dateTimeMode || ''}|${field.barSortOrder || ''}`,
    [field.columnName, field.aggregation, field.flavour, field.dataType, field.dateTimePart, field.dateTimeMode, field.barSortOrder]
  );
  
  // Normalize source to distinguish between axis chips (X/Y are the same) and available fields
  const isAxisChip = source === 'X_AXIS' || source === 'Y_AXIS';
  
  // Check for truncation when relevant properties change
  // Only needed for AVAILABLE_FIELDS - axis chips have fixed width and rarely truncate
  useLayoutEffect(() => {
    if (isAxisChip) {
      // For axis chips, assume always truncated (safer and avoids expensive checks)
      // Only update state if it's not already set to avoid triggering re-renders
      if (!isTruncated) {
        setIsTruncated(true);
      }
      return;
    }
    
    // Use single debounced timeout for AVAILABLE_FIELDS
    const timeoutId = setTimeout(checkTruncation, 150);
    
    return () => {
      clearTimeout(timeoutId);
    };
    // Use isAxisChip instead of source to avoid re-running when swapping X_AXIS <-> Y_AXIS
  }, [isAxisChip, fieldPropertiesKey, checkTruncation, isTruncated]);

  // Set up ResizeObserver to detect size changes (debounced for performance)
  // Only for AVAILABLE_FIELDS - axis chips have fixed dimensions
  useLayoutEffect(() => {
    if (isAxisChip) {
      return; // Skip ResizeObserver for axis chips
    }
    
    const el = chipLabelRef.current;
    const parentEl = chipRef.current;
    
    if (el && parentEl) {
      let timeoutId: number | undefined;
      const debouncedCheck = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        // Use setTimeout instead of RAF for better debouncing
        timeoutId = window.setTimeout(() => {
          checkTruncation();
        }, 200); // Increased debounce for better performance
      };
      
      const resizeObserver = new ResizeObserver(debouncedCheck);
      resizeObserver.observe(parentEl);
      resizeObserver.observe(el);
      
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resizeObserver.disconnect();
      };
    }
    // Use isAxisChip instead of source to avoid re-running when swapping X_AXIS <-> Y_AXIS
  }, [isAxisChip, checkTruncation]);

  // Hide tooltip whenever dragging starts
  useEffect(() => {
    if (isDragging) {
      setTooltipOpen(false);
    }
  }, [isDragging]);

  // Width properties based on source
  const widthProps = useMemo(() => {
    if (source !== 'AVAILABLE_FIELDS') {
      return {
        width: 240,
        maxWidth: 240,
        minWidth: 160,
      };
    } else {
      return {
        width: '100%', // Fill available space
        maxWidth: '100%',
      };
    }
  }, [source]);

  // Full label for tooltip
  const fullLabel = useMemo(() => 
    formatFullLabel(field),
    [field]
  );

  // ChipLabel component with forwarded ref
  const chipLabel = useMemo(() => (
    <FieldChipLabel 
      ref={chipLabelRef}
      field={field}
      source={source}
    />
  ), [field, source]);

  // Chip props
  const chipProps = useMemo(() => {
    const handleDragStartInternal = (e: React.DragEvent) => {
      setTooltipOpen(false);
      onDragStart(e);
    };

    const handleDragEndInternal = () => {
      setTooltipOpen(false);
      onDragEnd();
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      setTooltipOpen(false);
      // Call parent onMouseDown handler if provided
      if (onMouseDown) {
        onMouseDown(e);
      }
    };

    return {
      className: `${styles.chip} ${field.flavour === 'continuous' ? styles.continuous : styles.discrete} ${source === 'AVAILABLE_FIELDS' ? styles.textOnly : styles.framed} ${isInvalidOnAxis ? styles.invalidAxisField : ''} ${isSelected ? styles.selected : ''} field-chip`,
      draggable: true,
      onDragStart: handleDragStartInternal,
      onDragEnd: handleDragEndInternal,
      onContextMenu,
      onClick,
      onMouseDown: handleMouseDown,
      style: {
        // Keep full opacity while dragging for readability
        opacity: 1,
        cursor: 'grab',
        ...widthProps,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        fontSize: source === 'AVAILABLE_FIELDS' ? undefined : '12px',
      },
      label: chipLabel
    };
  }, [
    field.flavour,
    source,
    onDragStart,
    onDragEnd,
    onContextMenu,
    onClick,
    widthProps,
    chipLabel,
    isInvalidOnAxis,
    isSelected
  ]);

  const handleWrapperDragStart = (e: React.DragEvent) => {
    // Delegate to chip's drag start (ensures dataTransfer set when dragging wrapper)
    if ((e.target as HTMLElement).closest('.field-chip')) {
      return; // Chip itself will handle
    }
    onDragStart(e);
  };

  const handleWrapperDragEnd = () => {
    onDragEnd();
  };

  return (
    <div
      ref={chipRef}
      draggable={!isTruncated} // when truncated Tooltip wraps Chip; keep wrapper draggable when not truncated
      onDragStart={handleWrapperDragStart}
      onDragEnd={handleWrapperDragEnd}
      style={{ 
        display: source === 'AVAILABLE_FIELDS' ? 'flex' : 'inline-flex',
        width: source === 'AVAILABLE_FIELDS' ? '100%' : 'auto',
        maxWidth: '100%',
        alignItems: 'center',
        minHeight: source === 'AVAILABLE_FIELDS' ? '20px' : 'auto', // Match chip height
        position: 'relative',
      }}
    >
      {/* Show badge when dragging multiple fields */}
      {isDragging && dragCount && dragCount > 1 && (
        <div style={{
          position: 'absolute',
          top: -8,
          right: -8,
          backgroundColor: '#1976d2',
          color: 'white',
          borderRadius: '50%',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 'bold',
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          {dragCount}
        </div>
      )}
      {isTruncated ? (
        <Tooltip 
          title={<span className={labelStyles.tooltipContent}>{fullLabel}</span>} 
          enterDelay={500}
          open={tooltipOpen}
          onOpen={handleTooltipOpen}
          onClose={handleTooltipClose}
          disableInteractive
          disableFocusListener
          disableHoverListener={isDragging}
          arrow
          PopperProps={{
            modifiers: [
              {
                name: 'preventOverflow',
                options: {
                  altAxis: true,
                  tether: true,
                  padding: 0,
                  boundary: 'window',
                },
              },
              {
                name: 'maxWidth',
                enabled: false,
              },
            ],
          }}
          componentsProps={{
            tooltip: {
              sx: {
                maxWidth: 'none',
                padding: '6px 12px',
                fontSize: '13px',
                pointerEvents: 'none',
                backgroundColor: '#ffffff',
                color: '#111111',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }
            },
            arrow: {
              sx: {
                color: '#ffffff'
              }
            }
          }}
        >
          {/* Wrap Chip in a span with draggable to ensure drag events even through Tooltip cloning */}
          <span
            draggable
            onDragStart={handleWrapperDragStart}
            onDragEnd={handleWrapperDragEnd}
            style={{ 
              display: source === 'AVAILABLE_FIELDS' ? 'flex' : 'inline-flex',
              width: source === 'AVAILABLE_FIELDS' ? '100%' : 'auto',
            }}
          >
            <Chip {...chipProps} />
          </span>
        </Tooltip>
      ) : (
        <Chip {...chipProps} />
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
// Only re-render if key props actually change
export default React.memo(ChipWithTooltip, (prevProps, nextProps) => {
  // Compare field properties that affect rendering
  return (
    prevProps.field.id === nextProps.field.id &&
    prevProps.field.columnName === nextProps.field.columnName &&
    prevProps.field.aggregation === nextProps.field.aggregation &&
    prevProps.field.flavour === nextProps.field.flavour &&
    prevProps.field.dataType === nextProps.field.dataType &&
    prevProps.field.dateTimePart === nextProps.field.dateTimePart &&
    prevProps.field.dateTimeMode === nextProps.field.dateTimeMode &&
    prevProps.field.barSortOrder === nextProps.field.barSortOrder &&
    prevProps.source === nextProps.source &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isInvalidOnAxis === nextProps.isInvalidOnAxis &&
    prevProps.dragCount === nextProps.dragCount
    // Note: onContextMenu, onDragStart, onDragEnd, onClick are wrapped in useCallback in parent
  );
});
