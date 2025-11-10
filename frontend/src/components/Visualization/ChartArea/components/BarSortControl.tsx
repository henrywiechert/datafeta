import React, { useState } from 'react';
import { Field } from '../../../../types';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import styles from './BarSortControl.module.css';

interface BarSortControlProps {
  xFields: Field[];
  yFields: Field[];
}

/**
 * BarSortControl - In-chart sort icon overlay for bar charts
 * 
 * Displays a clickable sort icon next to the axis label when viewing a bar chart.
 * The icon cycles through: None → Ascending → Descending → None
 */
const BarSortControl: React.FC<BarSortControlProps> = ({
  xFields,
  yFields,
}) => {
  const { dispatch } = useVisualizationContext();
  const [isHovering, setIsHovering] = useState(false);

  // Determine if this is a bar chart scenario (measure on one axis only)
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xMeasures = xFields.filter(f => f.type === 'measure');
  
  // Bar chart: measures on one axis, not both
  const isBarChart = (yMeasures.length > 0 && xMeasures.length === 0) || 
                     (xMeasures.length > 0 && yMeasures.length === 0);
  
  if (!isBarChart) {
    return null;
  }

  const isVertical = yMeasures.length > 0;
  const measures = isVertical ? yMeasures : xMeasures;
  
  // Find the first measure (or one with sort active)
  const measureWithSort = measures.find(m => m.barSortOrder && m.barSortOrder !== 'none');
  const targetMeasure = measureWithSort || measures[0];

  if (!targetMeasure) {
    return null;
  }

  const currentSort = targetMeasure.barSortOrder || 'none';

  // Cycle through sort states
  const cycleSortOrder = () => {
    let newSortOrder: 'none' | 'asc' | 'desc';
    
    if (!currentSort || currentSort === 'none') {
      newSortOrder = 'asc';
    } else if (currentSort === 'asc') {
      newSortOrder = 'desc';
    } else {
      newSortOrder = 'none';
    }

    const updatedField = {
      ...targetMeasure,
      barSortOrder: newSortOrder
    };

    dispatch({ type: 'UPDATE_FIELD', payload: updatedField });
  };

  // Get icon and tooltip based on current state
  const getIconAndTooltip = () => {
    switch (currentSort) {
      case 'asc':
        return { icon: '↑', tooltip: 'Sorted ascending (click to sort descending)' };
      case 'desc':
        return { icon: '↓', tooltip: 'Sorted descending (click to remove sort)' };
      default:
        return { icon: '↕', tooltip: 'Click to sort by value' };
    }
  };

  const { icon, tooltip } = getIconAndTooltip();

  // Determine if icon should be visible
  // Always visible when sorting is active, only on hover when not sorting
  const shouldShowIcon = currentSort !== 'none' || isHovering;

  return (
    <div
      className={styles.container}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button
        className={`${styles.sortButton} ${shouldShowIcon ? styles.visible : styles.hidden}`}
        onClick={cycleSortOrder}
        title={tooltip}
        aria-label={tooltip}
      >
        {icon}
      </button>
    </div>
  );
};

export default BarSortControl;

