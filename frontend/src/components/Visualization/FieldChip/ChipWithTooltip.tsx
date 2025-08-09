import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
}

const ChipWithTooltip: React.FC<ChipWithTooltipProps> = ({
  field,
  source,
  onContextMenu,
  onDragStart,
  onDragEnd,
  isDragging
}) => {
  const chipLabelRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

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

  // Create a stable reference for field properties we need to track
  const fieldProperties = useMemo(() => ({
    columnName: field.columnName, 
    aggregation: field.aggregation, 
    flavour: field.flavour, 
    dataType: field.dataType
  }), [field.columnName, field.aggregation, field.flavour, field.dataType]);
  
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
  const chipProps = useMemo(() => ({
    className: `${styles.chip} ${field.flavour === 'continuous' ? styles.continuous : styles.discrete} ${source === 'AVAILABLE_FIELDS' ? styles.textOnly : styles.framed} field-chip`,
    draggable: true,
    onDragStart,
    onDragEnd,
    onContextMenu,
    style: {
      opacity: isDragging ? 0.5 : 1,
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
  }), [
    field.flavour,
    source,
    onDragStart,
    onDragEnd,
    onContextMenu,
    isDragging,
    widthProps,
    chipLabel
  ]);

  return (
    <div ref={chipRef}>
      {isTruncated ? (
        <Tooltip 
          title={<span className={labelStyles.tooltipContent}>{fullLabel}</span>} 
          enterDelay={500} 
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
              }
            }
          }}
        >
          <Chip {...chipProps} />
        </Tooltip>
      ) : (
        <Chip {...chipProps} />
      )}
    </div>
  );
};

export default ChipWithTooltip;
