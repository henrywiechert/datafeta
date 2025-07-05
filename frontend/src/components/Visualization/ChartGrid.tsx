import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Vega } from 'react-vega';
import { VegaLiteSpec } from '../../spec-generator/specGenerator';
import { QueryResult } from '../../types';
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  spec: VegaLiteSpec;
  data: QueryResult | null;
}

const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle container resize events - only update when resize is complete
  const handleResize = useCallback(() => {
    // Clear any existing timeout
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    // Wait for resize operation to complete (no changes for 300ms)
    resizeTimeoutRef.current = setTimeout(() => {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setContainerSize({
          width: rect.width,
          height: rect.height
        });
      }
    }, 300); // Longer delay to ensure resize operation is complete
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set initial size
    const rect = container.getBoundingClientRect();
    setContainerSize({
      width: rect.width,
      height: rect.height
    });

    // Create ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      // Clean up timeout on unmount
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [handleResize]);

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <div ref={containerRef} className={styles.container}>
        <p>No data to display. Drag fields to the axes to create a chart.</p>
      </div>
    );
  }
  
  // The backend already returns rows as an array of objects, which is exactly what Vega-Lite expects!
  // No transformation needed - just use the data directly
  const chartData = data.rows;

  // Detect if this is a faceted chart or an expandable chart (e.g., bar chart with many categories)
  const isFaceted = spec.encoding && (spec.encoding.column || spec.encoding.row);
  const isHorizontallyExpandable = spec.width && typeof spec.width === 'object' && 'step' in spec.width;
  const isVerticallyExpandable = spec.height && typeof spec.height === 'object' && 'step' in spec.height;

  let containerClass = styles.container;
  if (isFaceted) {
    containerClass = `${styles.container} ${styles.faceted}`;
  } else if (isHorizontallyExpandable) {
    containerClass = `${styles.container} ${styles.horizontalExpandable}`;
  } else if (isVerticallyExpandable) {
    containerClass = `${styles.container} ${styles.verticalExpandable}`;
  }

  return (
    <div ref={containerRef} className={containerClass}>
      <Vega 
        key={`${containerSize.width}x${containerSize.height}`} // Force re-render when container size changes
        spec={spec} 
        data={{ table: chartData }} 
        actions={false}
        renderer="svg"
      />
    </div>
  );
};

export default ChartGrid;
