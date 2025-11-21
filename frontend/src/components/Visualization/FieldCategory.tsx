import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Typography, Box } from '@mui/material';
import { List } from 'react-window';
import FieldChip from './FieldChip/index';
import { Field } from '../../types';
import styles from './FieldsPanel.module.css';

interface FieldCategoryProps {
  title: string;
  fields: Field[];
  onUpdate: (field: Field) => void;
}

// Use virtualization if more than this many fields
// Lower threshold since full-width chips cause more reflow during resize
const VIRTUALIZATION_THRESHOLD = 50;
const ITEM_HEIGHT = 21; // Height of each field chip (20px chip + 1px margin)

// Stable style object for virtualized rows (defined outside component to avoid recreation)
const ROW_BASE_STYLE = { 
  paddingBottom: 0,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'flex-start' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
  // contain removed to prevent z-index stacking issues with context menus
};

const FieldCategory: React.FC<FieldCategoryProps> = ({ title, fields, onUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  
  // Measure available height for the list (debounced for performance)
  useEffect(() => {
    if (!containerRef.current) return;
    
    let timeoutId: number | undefined;
    const updateHeight = () => {
      if (timeoutId) {
        cancelAnimationFrame(timeoutId);
      }
      // Throttle updates to animation frames
      timeoutId = requestAnimationFrame(() => {
        if (containerRef.current) {
          const parentElement = containerRef.current.parentElement;
          if (parentElement) {
            const rect = parentElement.getBoundingClientRect();
            // Calculate available space, accounting for other elements
            const availableHeight = Math.max(300, rect.height - 100);
            setContainerHeight(availableHeight);
          }
        }
      });
    };
    
    updateHeight();
    
    // Use ResizeObserver for more accurate tracking
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement);
    }
    
    return () => {
      if (timeoutId) {
        cancelAnimationFrame(timeoutId);
      }
      resizeObserver.disconnect();
    };
  }, []);
  
  // Use virtualization for large lists
  const useVirtualization = fields.length > VIRTUALIZATION_THRESHOLD;
  
  // Row component for virtualized list - optimized to not recreate on every render
  // The key optimization: remove onUpdate from dependencies since it's stable
  const RowComponent = useCallback((props: {
    ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
    index: number;
    style: React.CSSProperties;
  }) => {
    const { index, style } = props;
    const field = fields[index];
    return (
      <div style={{ ...style, ...ROW_BASE_STYLE }}>
        <FieldChip 
          field={field} 
          onUpdate={onUpdate} 
          source="AVAILABLE_FIELDS" 
        />
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]); // Intentionally omitting onUpdate - it's stable from parent (memoized in useFieldOperations)
  
  if (useVirtualization) {
    // Virtualized rendering for performance with many fields
    const listHeight = Math.min(fields.length * ITEM_HEIGHT, containerHeight);
    
    return (
      <Box className={styles.fieldCategory}>
        <Typography variant="subtitle2" className={styles.categoryTitle}>
          {title} ({fields.length})
        </Typography>
        <Box ref={containerRef} style={{ width: '100%' }}>
          <List
            defaultHeight={listHeight}
            rowCount={fields.length}
            rowHeight={ITEM_HEIGHT}
            rowComponent={RowComponent}
            rowProps={{}}
            style={{ 
              overflowX: 'hidden',
              willChange: 'transform', // Hint browser for smooth scrolling
            }}
          >
            {null}
          </List>
        </Box>
      </Box>
    );
  }
  
  // Standard rendering for small lists
  return (
    <Box className={styles.fieldCategory}>
      <Typography variant="subtitle2" className={styles.categoryTitle}>
        {title}
      </Typography>
      <Box className={styles.fieldsContainer}>
        {fields.map(field => (
          <FieldChip 
            key={field.id} 
            field={field} 
            onUpdate={onUpdate} 
            source="AVAILABLE_FIELDS" 
          />
        ))}
        {fields.length === 0 && (
          <Typography variant="body2" className={styles.emptyMessage}>
            No {title.toLowerCase()} available
          </Typography>
        )}
      </Box>
    </Box>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
// Only re-render if title, fields array, or onUpdate callback changes
export default React.memo(FieldCategory);
