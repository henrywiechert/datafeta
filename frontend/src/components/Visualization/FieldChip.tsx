import React, { useState, useRef, useLayoutEffect } from 'react';
import { Field } from '../../types';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import styles from './FieldChip.module.css';
import ContextMenu from './ContextMenu';
import SubMenu from './SubMenu';
import menuStyles from './ContextMenu.module.css';
import { getAvailableAggregations } from '../../utils/fieldUtils';

export type DragSource = 'AVAILABLE_FIELDS' | 'X_AXIS' | 'Y_AXIS';

interface FieldChipProps {
  field: Field;
  source: DragSource;
  onUpdate: (field: Field) => void;
  index?: number;
}

/**
 * FieldChip Component
 * 
 * This component displays a field as a draggable chip that can appear in either:
 * 1. The Fields area (left panel) - source: AVAILABLE_FIELDS
 * 2. The Axes drop zones - source: X_AXIS or Y_AXIS
 * 
 * Features:
 * - Draggable for drag and drop operations
 * - Context menu for changing field properties
 * - Tooltips that only show when text is truncated
 * - Visual styling based on field properties (continuous/discrete)
 * - Automatic truncation detection with ResizeObserver
 */
const FieldChip: React.FC<FieldChipProps> = ({ field, source, onUpdate, index }) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chipLabelRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Memoize the check function to include the current source in its closure
  // This ensures it references the latest source value when called
  const checkTruncation = React.useCallback(() => {
    const el = chipLabelRef.current;
    if (el) {
      // Add small buffer (1px) to account for rounding errors
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      const isTextTruncated = scrollWidth > (clientWidth + 1);
      
      // Force different truncation behavior based on source
      // Axes drop zones should always show tooltips if there's any chance of truncation
      // Fields panel should be more conservative with tooltips
      if (source === 'AVAILABLE_FIELDS') {
        // For Fields area - only show tooltip when definitely truncated
        setIsTruncated(isTextTruncated && scrollWidth - clientWidth > 5); // More significant truncation
      } else {
        // For drop zones - show tooltip when there's any truncation
        setIsTruncated(isTextTruncated);
      }
    }
  }, [source]);

  // Create a stable reference for the field data that we need to track
  const fieldProperties = React.useMemo(() => ({
    columnName: field.columnName, 
    aggregation: field.aggregation, 
    flavour: field.flavour, 
    dataType: field.dataType
  }), [field.columnName, field.aggregation, field.flavour, field.dataType]);
  
  useLayoutEffect(() => {
    // Use two timeouts with different delays to ensure DOM is fully rendered and layout is complete
    const immediateCheck = setTimeout(checkTruncation, 0);
    const delayedCheck = setTimeout(checkTruncation, 100); // Second check after 100ms
    
    return () => {
      clearTimeout(immediateCheck);
      clearTimeout(delayedCheck);
    };
  }, [source, fieldProperties, checkTruncation]);

  // Set up ResizeObserver to detect size changes that might affect truncation
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

  const handleDragStart = React.useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      field,
      source,
      index
    }));
    e.dataTransfer.effectAllowed = 'move';
  }, [field, source, index]);

  const handleDragEnd = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // Get the element's position
    const rect = event.currentTarget.getBoundingClientRect();
    
    // Position menu relative to the element, not the exact click point
    // This provides more consistent positioning across different layouts
    const x = rect.left;
    const y = rect.bottom + 5; // 5px below the element
    
    setMenuPosition({ x, y });
  }, []);

  const handleCloseMenu = React.useCallback(() => {
    setMenuPosition(null);
  }, []);

  const handleUpdate = React.useCallback((updates: Partial<Field>) => {
    // Ensure we're working with the current field state, not a stale closure
    const currentField = field;
    const newField = { ...currentField, ...updates };

    if (updates.type === 'dimension') {
      delete newField.aggregation;
    }

    // Ensure flavour has a default value if not set
    if (!newField.flavour) {
      newField.flavour = 'discrete';
    }

    // Enforce constraint: string fields can only be discrete
    if (newField.dataType === 'string' && updates.flavour === 'continuous') {
      // Don't allow the change, keep it discrete
      return;
    }

    // Enforce constraint: datetime fields can only be measures
    if (newField.dataType === 'datetime' && updates.type === 'measure') {
      // Don't allow the change, keep it as dimension
      return;
    }

    // If changing to string data type, force flavour to discrete
    if (updates.dataType === 'string') {
      newField.flavour = 'discrete';
    }

    // If changing to datetime data type, force type to dimension
    if (updates.dataType === 'datetime') {
      newField.type = 'dimension';
      delete newField.aggregation; // Remove any aggregation since it's now a dimension
    }

    onUpdate(newField);
    handleCloseMenu();
  }, [field, onUpdate, handleCloseMenu]);

  const renderMenuItems = React.useCallback(() => {
    const isMeasure = field.type === 'measure';
    const availableAggregations = getAvailableAggregations(field);
    const canBeContinuous = field.dataType !== 'string'; // String fields can only be discrete
    const canBeMeasure = field.dataType !== 'datetime'; // DateTime fields can only be dimensions
    const isInAxisDropZone = source === 'X_AXIS' || source === 'Y_AXIS';

    return (
      <>
        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ type: 'dimension' })}>
          Dimension {field.type === 'dimension' && '✔'}
        </div>
        <div 
          className={`${menuStyles.menuItem} ${!canBeMeasure ? menuStyles.disabled : ''}`} 
          onClick={canBeMeasure ? () => handleUpdate({ type: 'measure' }) : undefined}
        >
          Measure {field.type === 'measure' && '✔'} {!canBeMeasure && '(DateTime fields only)'}
        </div>
        
        <div className={menuStyles.separator} />

        <div className={menuStyles.menuItem} onClick={() => handleUpdate({ flavour: 'discrete' })}>
          Discrete {field.flavour === 'discrete' && '✔'}
        </div>
        <div 
          className={`${menuStyles.menuItem} ${!canBeContinuous ? menuStyles.disabled : ''}`} 
          onClick={canBeContinuous ? () => handleUpdate({ flavour: 'continuous' }) : undefined}
        >
          Continuous {field.flavour === 'continuous' && '✔'} {!canBeContinuous && '(String fields only)'}
        </div>
        
        {/* Only show data type selection when field is in available fields panel */}
        {!isInAxisDropZone && (
          <>
            <div className={menuStyles.separator} />

            <SubMenu label={`Data Type (${field.dataType})`}>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'string' })}>
                String {field.dataType === 'string' && '✔'}
              </div>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'integer' })}>
                Integer {field.dataType === 'integer' && '✔'}
              </div>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'float' })}>
                Float {field.dataType === 'float' && '✔'}
              </div>
              <div className={menuStyles.menuItem} onClick={() => handleUpdate({ dataType: 'datetime' })}>
                DateTime {field.dataType === 'datetime' && '✔'}
              </div>
            </SubMenu>
          </>
        )}
        
        {isMeasure && availableAggregations.length > 0 && <div className={menuStyles.separator} />}

        {isMeasure && availableAggregations.map(agg => (
          <div key={agg} className={menuStyles.menuItem} onClick={() => handleUpdate({ aggregation: agg })}>
            {agg} {field.aggregation === agg && '✔'}
          </div>
        ))}
      </>
    );
  }, [field, source, handleUpdate]);

  // Compose the full label text for tooltip and chip - memoized to avoid recalculation
  const fullLabel = React.useMemo(() => 
    `${field.columnName}${field.aggregation ? `(${field.aggregation})` : ''} [${field.flavour}] (${field.dataType})`, 
    [field.columnName, field.aggregation, field.flavour, field.dataType]
  );

  const chipLabel = React.useMemo(() => (
    <span
      ref={chipLabelRef}
      className={`${styles.chipText} ${source === 'AVAILABLE_FIELDS' ? styles.availableFieldsText : styles.axisFieldsText}`}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: source === 'AVAILABLE_FIELDS' ? 'block' : 'inline-block',
        width: '100%',
        maxWidth: '100%',
        fontSize: source === 'AVAILABLE_FIELDS' ? undefined : '12px',
        textAlign: source === 'AVAILABLE_FIELDS' ? 'left' : undefined,
      }}
    >
      <span className={`${styles.symbol} ${field.flavour === 'continuous' ? styles.continuousSymbol : styles.discreteSymbol}`}>#</span>
      {field.columnName} {field.aggregation && `(${field.aggregation})`} [{field.flavour}] ({field.dataType})
    </span>
  ), [field.columnName, field.aggregation, field.flavour, field.dataType, source, chipLabelRef]);

  // Set up different widths based on source - memoized to avoid recalculations
  const widthProps = React.useMemo(() => {
    // For axis drop zones (X_AXIS, Y_AXIS)
    if (source !== 'AVAILABLE_FIELDS') {
      return {
        width: 240,
        maxWidth: 240,
        minWidth: 160,
      };
    } 
    // For fields area (AVAILABLE_FIELDS)
    else {
      return {
        width: '100%', // Use parent width
        maxWidth: '100%',
      };
    }
  }, [source]);

  // Memoize chip props to avoid recalculation on each render
  const chipProps = React.useMemo(() => ({
    className: `${styles.chip} ${field.flavour === 'continuous' ? styles.continuous : styles.discrete} ${source === 'AVAILABLE_FIELDS' ? styles.textOnly : styles.framed} field-chip`,
    draggable: true,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onContextMenu: handleContextMenu,
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
    handleDragStart,
    handleDragEnd,
    handleContextMenu,
    isDragging,
    widthProps,
    chipLabel
  ]);

  return (
    <>
      <div ref={chipRef}>
        {isTruncated ? (
          <Tooltip 
            title={<span style={{whiteSpace: 'nowrap', display: 'block'}}>{fullLabel}</span>} 
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
      
      {menuPosition && (
        <ContextMenu position={menuPosition} onClose={handleCloseMenu}>
          {renderMenuItems()}
        </ContextMenu>
      )}
    </>
  );
};

export default FieldChip;