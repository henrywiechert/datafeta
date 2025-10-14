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
  isDragging: boolean;
  isInvalidOnAxis?: boolean;
}

const ChipWithTooltip: React.FC<ChipWithTooltipProps> = ({
  field,
  source,
  onContextMenu,
  onDragStart,
  onDragEnd,
  isDragging,
  isInvalidOnAxis
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

  // Create a stable reference for field properties we need to track
  const fieldProperties = useMemo(() => ({
    columnName: field.columnName, 
    aggregation: field.aggregation, 
    flavour: field.flavour, 
    dataType: field.dataType,
    dateTimePart: field.dateTimePart,
    dateTimeMode: field.dateTimeMode
  }), [field.columnName, field.aggregation, field.flavour, field.dataType, field.dateTimePart, field.dateTimeMode]);
  
  // Check for truncation when relevant properties change
  useLayoutEffect(() => {
    // Use timeouts to ensure DOM is fully rendered
    const immediateCheck = setTimeout(checkTruncation, 0);
    const delayedCheck = setTimeout(checkTruncation, 100);
    
    return () => {
      clearTimeout(immediateCheck);
      clearTimeout(delayedCheck);
    };
  }, [source, fieldProperties, checkTruncation]);

  // Set up ResizeObserver to detect size changes
  useLayoutEffect(() => {
    const el = chipLabelRef.current;
    const parentEl = chipRef.current;
    
    if (el && parentEl) {
      const resizeObserver = new ResizeObserver(checkTruncation);
      resizeObserver.observe(parentEl);
      resizeObserver.observe(el);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [checkTruncation]);

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
        width: '100%',
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

    const handleMouseDown = () => {
      setTooltipOpen(false);
    };

    return {
      className: `${styles.chip} ${field.flavour === 'continuous' ? styles.continuous : styles.discrete} ${source === 'AVAILABLE_FIELDS' ? styles.textOnly : styles.framed} ${isInvalidOnAxis ? styles.invalidAxisField : ''} field-chip`,
      draggable: true,
      onDragStart: handleDragStartInternal,
      onDragEnd: handleDragEndInternal,
      onContextMenu,
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
    widthProps,
    chipLabel,
    isInvalidOnAxis
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
      style={{ display: 'inline-block' }}
    >
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
            style={{ display: 'inline-flex' }}
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

export default ChipWithTooltip;
