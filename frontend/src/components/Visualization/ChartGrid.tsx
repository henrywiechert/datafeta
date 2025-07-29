import React, { useState, useRef, useEffect } from 'react';
import { Vega } from 'react-vega';
import { QueryResult } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import ObservablePlot from './ObservablePlot';
import { Alert, Box, Typography, Button } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import styles from './ChartGrid.module.css';

interface ChartGridProps {
  spec: any; // Allow both Vega and Vega-Lite specs
  data: QueryResult | null;
}

// Constants for data size limits
const MAX_SAFE_ROWS = 50000;      // Hard limit for rendering
const WARN_ROWS = 10000;          // Show warning above this
const SAMPLE_SIZE = 5000;         // Sample size for large datasets

/**
 * ChartGrid - Universal chart renderer for both Vega and Vega-Lite
 * 
 * ARCHITECTURE NOTE: This component handles BOTH chart types but keeps their logic separate:
 * - Vega-Lite: Uses built-in responsive sizing ("width": "container")
 * - Vega: Uses custom dimension management and signal updates
 * 
 * Detection: spec.$schema.includes('vega-lite') determines chart type
 */
const ChartGrid: React.FC<ChartGridProps> = ({ spec, data }) => {
  const [showFullData, setShowFullData] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // VEGA-ONLY: Store reference to Vega view for direct signal updates
  const vegaViewRef = useRef<any>(null);

  // Detect chart type early to enable type-specific logic
  const isVegaLite = spec?.$schema?.includes('vega-lite');
  const isObservablePlot = spec?.library === 'observable-plot';

  // ============================================================================
  // VEGA-ONLY: Container dimension tracking for hybrid responsive sizing
  // ============================================================================
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Be more conservative with sizing to avoid scrollbars
        // Account for: container padding (8px * 2) + chart padding + axes/margins
        const width = Math.max(200, rect.width - 40); // Extra buffer for axes and margins
        const height = Math.max(150, rect.height - 40); // Extra buffer for axes and margins
        
        setDimensions(prevDimensions => {
          // Only update if dimensions actually changed
          if (prevDimensions.width !== width || prevDimensions.height !== height) {
            // VEGA-ONLY: If we have a Vega view, update its signals directly
            if (vegaViewRef.current && !isVegaLite) {
              setTimeout(() => {
                vegaViewRef.current.signal('width', width).signal('height', height).run();
              }, 10);
            }
            return { width, height };
          }
          return prevDimensions;
        });
      }
    };

    // Initial measurement
    updateDimensions();
    
    // Set up ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      // Small delay to ensure layout is stable
      setTimeout(updateDimensions, 10);
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen for window resize events (triggered by debug panel changes)
    const handleWindowResize = () => {
      setTimeout(updateDimensions, 50);
    };
    
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [spec, isVegaLite]);

  // ============================================================================
  // VEGA-ONLY: Handle new Vega view creation for signal updates
  // ============================================================================
  const handleNewView = (view: any) => {
    if (!isVegaLite) {
      vegaViewRef.current = view;
    }
  };

  // Handle null or missing spec
  if (!spec) {
    return (
      <div className={styles.container} ref={containerRef}>
        <p>Generating chart specification...</p>
      </div>
    );
  }

  // Handle Observable Plot rendering
  if (isObservablePlot) {
    return (
      <div className={`${styles.container} ${styles.observablePlotContainer}`} ref={containerRef}>
        <ObservablePlot plot={(spec as PlotResult).plot} />
      </div>
    );
  }

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <div className={styles.container} ref={containerRef}>
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
      <div className={styles.container} ref={containerRef}>
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

  // Detect chart type and special layout requirements
  const isFaceted = spec.encoding && (spec.encoding.column || spec.encoding.row);
  const isHorizontallyExpandable = spec.width && typeof spec.width === 'object' && 'step' in spec.width;
  const isVerticallyExpandable = spec.height && typeof spec.height === 'object' && 'step' in spec.height;

  // Build container class based on chart type and characteristics
  let containerClass = styles.container;
  
  // Apply chart-type-specific styling
  if (isVegaLite) {
    containerClass = `${containerClass} ${styles.vegaLiteContainer}`;
  } else {
    containerClass = `${containerClass} ${styles.vegaContainer}`;
  }
  
  // Apply layout-specific styling for special cases
  if (isFaceted) {
    containerClass = `${containerClass} ${styles.faceted}`;
  } else if (isHorizontallyExpandable) {
    containerClass = `${containerClass} ${styles.horizontalExpandable}`;
  } else if (isVerticallyExpandable) {
    containerClass = `${containerClass} ${styles.verticalExpandable}`;
  }

  return (
    <div className={containerClass} ref={containerRef}>
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
      
             {/* ============================================================================ */}
       {/* CHART RENDERING: Type-specific props based on Vega vs Vega-Lite */}
       {/* ============================================================================ */}
       <Vega 
         spec={spec} 
         data={isVegaLite ? { table: chartData } : undefined} 
         actions={false}
         renderer="svg"
         onNewView={!isVegaLite ? handleNewView : undefined}
         // VEGA-ONLY: Pass dimensions for hybrid responsive sizing
         {...(!isVegaLite ? {
           width: dimensions.width,
           height: dimensions.height
         } : {})}
       />
    </div>
  );
};

export default ChartGrid;
