import React, { useMemo } from 'react';
import { Field } from '../../../types';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import styles from './FieldChip.module.css';
import { formatFullLabel } from './utils';
import { DragSource } from './types';
import FieldChipLabel from './FieldChipLabel';
import labelStyles from './FieldChipLabel.module.css';
import { useTruncationDetection } from './useTruncationDetection';
import { getChipWidthProps, getChipClassNames } from './chipStyles';

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
  displayNameOverride?: string;
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
  isInvalidOnAxis = false,
  dragCount,
  displayNameOverride
}) => {
  const isAvailableFields = source === 'AVAILABLE_FIELDS';
  const isAxis = source === 'X_AXIS' || source === 'Y_AXIS';
  // Create a stable key for field properties to minimize re-renders
  // Note: displayAlias is NOT included here because it's looked up from context at render time
  const fieldPropertiesKey = useMemo(() => 
    `${field.columnName}|${field.aggregation || ''}|${field.flavour}|${field.dataType}|${field.dateTimePart || ''}|${field.dateTimeMode || ''}|${field.barSortOrder || ''}`,
    [field.columnName, field.aggregation, field.flavour, field.dataType, field.dateTimePart, field.dateTimeMode, field.barSortOrder]
  );

  // Use custom hook for truncation detection and tooltip management
  const {
    isTruncated,
    chipLabelRef,
    chipRef,
    tooltipOpen,
    handleTooltipOpen,
    handleTooltipClose,
  } = useTruncationDetection({
    source,
    fieldPropertiesKey,
    isDragging,
  });

  // Width properties based on source
  const widthProps = useMemo(() => getChipWidthProps(source), [source]);

  // Full label for tooltip
  const fullLabel = useMemo(() => formatFullLabel(field), [field]);

  // ChipLabel component with forwarded ref
  const chipLabel = useMemo(() => (
    <FieldChipLabel 
      ref={chipLabelRef}
      field={field}
      source={source}
      displayNameOverride={displayNameOverride}
    />
  ), [field, source, displayNameOverride, chipLabelRef]);

  // Chip props
  const chipProps = useMemo(() => {
    const handleDragStartInternal = (e: React.DragEvent) => {
      handleTooltipClose();
      onDragStart(e);
    };

    const handleDragEndInternal = () => {
      handleTooltipClose();
      onDragEnd();
    };

    const handleMouseDownInternal = (e: React.MouseEvent) => {
      handleTooltipClose();
      if (onMouseDown) {
        onMouseDown(e);
      }
    };

    return {
      className: getChipClassNames(field, source, isInvalidOnAxis, isSelected, styles),
      draggable: true,
      onDragStart: handleDragStartInternal,
      onDragEnd: handleDragEndInternal,
      onContextMenu,
      onClick,
      onMouseDown: handleMouseDownInternal,
      style: {
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
    field,
    source,
    isInvalidOnAxis,
    isSelected,
    onDragStart,
    onDragEnd,
    onContextMenu,
    onClick,
    onMouseDown,
    widthProps,
    chipLabel,
    handleTooltipClose
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
        display: isAxis ? 'inline-flex' : 'flex',
        width: isAxis ? 'auto' : '100%',
        maxWidth: '100%',
        alignItems: 'center',
        minWidth: 0,
        minHeight: isAvailableFields ? '20px' : 'auto', // Match chip height
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
              display: isAxis ? 'inline-flex' : 'flex',
              width: isAxis ? 'auto' : '100%',
              minWidth: 0,
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
// Note: displayAlias is NOT compared here because aliases are looked up from context
// by the FieldChipLabel child component, which will re-render independently when context changes
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
    prevProps.dragCount === nextProps.dragCount &&
    prevProps.displayNameOverride === nextProps.displayNameOverride
    // Note: onContextMenu, onDragStart, onDragEnd, onClick are wrapped in useCallback in parent
  );
});
