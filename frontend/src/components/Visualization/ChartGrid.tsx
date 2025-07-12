import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Vega } from 'react-vega';
import { VegaLiteSpec } from '../../spec-generator/specGenerator';
import { QueryResult } from '../../types';
import { Alert, Box, Typography, Button } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  spec: VegaLiteSpec | null;
  data: QueryResult | null;
}

// Constants for data size limits
const MAX_SAFE_ROWS = 50000;      // Hard limit for rendering
const WARN_ROWS = 10000;          // Show warning above this
const SAMPLE_SIZE = 5000;         // Sample size for large datasets

const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [showFullData, setShowFullData] = useState(false);
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

  // Handle null or missing spec
  if (!spec) {
    return (
      <div ref={containerRef} className={styles.container}>
        <p>Generating chart specification...</p>
      </div>
    );
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <div ref={containerRef} className={styles.container}>
        <p>No data to display. Drag fields to the axes to create a chart.</p>
      </div>
    );
  }

  const rowCount = data.rows.length;
  const isTooLarge = rowCount > MAX_SAFE_ROWS;
  const shouldWarn = rowCount > WARN_ROWS;

  // Determine what data to use
  let chartData = data.rows;
  let isUsingFullData = true;

  if (isTooLarge) {
    if (!showFullData) {
      // Sample the data to prevent browser freeze
      chartData = data.rows.slice(0, SAMPLE_SIZE);
      isUsingFullData = false;
      console.warn(`⚠️ Dataset too large (${rowCount} rows), using sample of ${SAMPLE_SIZE} rows`);
    }
  }

  // Show warning for large datasets
  if (isTooLarge && !showFullData) {
    return (
      <div ref={containerRef} className={styles.container}>
        <Box sx={{ p: 2 }}>
          <Alert 
            severity="warning" 
            icon={<WarningIcon />}
            sx={{ mb: 2 }}
          >
            <Typography variant="h6" gutterBottom>
              Dataset Too Large
            </Typography>
            <Typography variant="body2" paragraph>
              Your query returned <strong>{rowCount.toLocaleString()} rows</strong>, which is too large to render safely 
              ({MAX_SAFE_ROWS.toLocaleString()}+ rows can freeze the browser).
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Recommendations:</strong>
            </Typography>
            <ul style={{ margin: '0 0 16px 20px', padding: 0 }}>
              <li>Use aggregation (convert dimensions to measures)</li>
              <li>Add filters to reduce the data size</li>
              <li>Use discrete dimensions instead of continuous ones</li>
            </ul>
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowFullData(true)}
                color="warning"
              >
                Show Sample ({SAMPLE_SIZE.toLocaleString()} rows)
              </Button>
            </Box>
          </Alert>
        </Box>
      </div>
    );
  }

  // Show warning but still render if dataset is moderately large
  const renderChart = () => (
    <Vega 
      key={`${containerSize.width}x${containerSize.height}`} // Force re-render when container size changes
      spec={spec} 
      data={{ table: chartData }} 
      actions={false}
      renderer="svg"
    />
  );

  // Detect if this is a faceted chart or an expandable chart (e.g., bar chart with many categories)
  // Now safely access spec properties after null check
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
      {shouldWarn && isUsingFullData && (
        <Alert severity="info" sx={{ mb: 1 }}>
          <Typography variant="body2">
            Large dataset ({rowCount.toLocaleString()} rows). Consider using aggregation for better performance.
          </Typography>
        </Alert>
      )}
      
      {!isUsingFullData && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          <Typography variant="body2">
            Showing sample of {chartData.length.toLocaleString()} rows out of {rowCount.toLocaleString()} total rows.
          </Typography>
        </Alert>
      )}
      
      {renderChart()}
    </div>
  );
};

export default ChartGrid;
