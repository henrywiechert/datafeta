import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import * as Plot from '@observablehq/plot';
import { CustomTooltip, TooltipField } from './CustomTooltip/CustomTooltip';
import { useChartTooltip } from '../../hooks/useChartTooltip';

// Extended options interface to support custom tooltip configuration
export interface CustomTooltipConfig {
  enabled: boolean;
  getFields: (data: any) => TooltipField[];
  data?: any[]; // Original data array for indexing
}

interface ObservablePlotProps {
  options: Plot.PlotOptions & {
    __customTooltip?: CustomTooltipConfig;
  };
  plotId?: string; // Unique ID for tracking rendering
  onRenderComplete?: (plotId: string) => void; // Callback when rendering is done
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ options, plotId, onRenderComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(document.body);
  const { tooltip, showTooltip, hideTooltip, updatePosition } = useChartTooltip();
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);

  // Detect fullscreen mode and update portal target
  useEffect(() => {
    const updatePortalTarget = () => {
      const fullscreenElement = (
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      ) as HTMLElement | null;

      // If we're in fullscreen mode, render tooltip inside fullscreen element
      // Otherwise, render to document.body
      setPortalTarget(fullscreenElement || document.body);
    };

    // Initial check
    updatePortalTarget();

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', updatePortalTarget);
    document.addEventListener('webkitfullscreenchange', updatePortalTarget);
    document.addEventListener('mozfullscreenchange', updatePortalTarget);
    document.addEventListener('MSFullscreenChange', updatePortalTarget);

    return () => {
      document.removeEventListener('fullscreenchange', updatePortalTarget);
      document.removeEventListener('webkitfullscreenchange', updatePortalTarget);
      document.removeEventListener('mozfullscreenchange', updatePortalTarget);
      document.removeEventListener('MSFullscreenChange', updatePortalTarget);
    };
  }, []);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Determine final plot dimensions, prioritizing explicit options over observed dimensions.
    const observedWidth = dimensions.width;
    const observedHeight = dimensions.height;
    const finalWidth = options.width !== undefined ? options.width : (observedWidth > 0 ? observedWidth : 400);
    const finalHeight = options.height !== undefined ? options.height : (observedHeight > 0 ? observedHeight : 300);

    // Debug logging disabled for performance with large faceted grids

    // Only render if we have valid dimensions to prevent errors.
    if (finalWidth > 0 && finalHeight > 0) {
      // IMPORTANT: Hide tooltip before clearing DOM to prevent stuck tooltips
      hideTooltip();
      
      // Clean up any existing event listeners from previous render
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
      
      // Create fresh options object with final dimensions
      // CRITICAL: Spread options to ensure Observable Plot doesn't use cached results
      const newOptions = {
        ...options,
        width: finalWidth,
        height: finalHeight,
        // Avoid clipping of tooltips beyond the plot frame
        style: { ...(options as any).style, overflow: 'visible' } as any,
      } as Plot.PlotOptions;

      try {
        // Force Observable Plot to create fresh plot (no caching)
        const plot = Plot.plot(newOptions);
        
        // Use replaceChildren for better performance than innerHTML
        // This is a single synchronous operation that's faster for the browser to process
        containerRef.current.replaceChildren(plot);

        // Success - no log needed to reduce console spam

        // Add custom tooltip event listeners if configured
        const customTooltipConfig = options.__customTooltip;
        if (customTooltipConfig?.enabled) {
          const cleanup = addTooltipListeners(plot, customTooltipConfig, showTooltip, hideTooltip, updatePosition);
          cleanupFunctionsRef.current.push(cleanup);
        }

        // Notify that rendering is complete - use requestAnimationFrame to ensure DOM is updated
        if (plotId && onRenderComplete) {
          requestAnimationFrame(() => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ObservablePlot] Render complete for plot:', plotId);
            }
            onRenderComplete(plotId);
          });
        }
      } catch (error) {
        console.error('ObservablePlot - Error creating plot:', error);
        // Still notify completion even on error to prevent hanging
        if (plotId && onRenderComplete) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ObservablePlot] Render error for plot, marking complete:', plotId);
          }
          onRenderComplete(plotId);
        }
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ObservablePlot] Skipping render - invalid dimensions:', { finalWidth, finalHeight });
      }
    }
    
    // Cleanup on unmount
    return () => {
      hideTooltip();
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [options, dimensions, showTooltip, hideTooltip, updatePosition, onRenderComplete, plotId]);

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Render tooltip using portal - to fullscreen element if in fullscreen, otherwise to body */}
      {ReactDOM.createPortal(
        <CustomTooltip
          x={tooltip.x}
          y={tooltip.y}
          fields={tooltip.fields}
          visible={tooltip.visible}
        />,
        portalTarget
      )}
    </>
  );
};

/**
 * Add tooltip event listeners to Observable Plot marks.
 * Extracts data from marks and displays custom tooltip on hover.
 * Returns a cleanup function to remove all event listeners.
 */
function addTooltipListeners(
  plot: SVGSVGElement | HTMLElement,
  config: CustomTooltipConfig,
  showTooltip: (x: number, y: number, fields: TooltipField[]) => void,
  hideTooltip: () => void,
  updatePosition: (x: number, y: number) => void
): () => void {
  // Find all interactive marks (circles, rects, paths with fill)
  // Observable Plot typically uses these elements for data visualization
  const marks = plot.querySelectorAll('circle, rect, path[fill]:not([fill="none"])');
  const cleanupFunctions: Array<() => void> = [];

  marks.forEach((mark, index) => {
    // Observable Plot stores data on elements via __data__ property
    const element = mark as any;
    
    const handleMouseEnter = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      
      // Add highlight class to emphasize the hovered mark
      mark.classList.add('chart-mark--highlighted');
      
      // Try multiple ways to get data:
      // 1. From __data__ property (D3 style)
      // 2. From our data array if provided
      let data = element.__data__;
      
      if (!data && config.data && config.data.length > 0) {
        // Fallback: use data array index if available
        // This assumes marks are in same order as data
        if (index < config.data.length) {
          data = config.data[index];
        }
      }
      
      // If __data__ is a number (index), it might be storing the index instead of actual data
      if (typeof data === 'number' && config.data && data < config.data.length) {
        data = config.data[data];
      }
      
      if (data) {
        try {
          const fields = config.getFields(data);
          showTooltip(mouseEvent.clientX, mouseEvent.clientY, fields);
        } catch (error) {
          console.warn('[CustomTooltip] Error generating tooltip fields:', error);
        }
      } else {
        console.warn('[CustomTooltip] No data found for mark:', { index, element, available: config.data?.length });
      }
    };

    const handleMouseMove = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      updatePosition(mouseEvent.clientX, mouseEvent.clientY);
    };

    const handleMouseLeave = () => {
      // Remove highlight class when mouse leaves
      mark.classList.remove('chart-mark--highlighted');
      
      hideTooltip();
    };

    mark.addEventListener('mouseenter', handleMouseEnter);
    mark.addEventListener('mousemove', handleMouseMove);
    mark.addEventListener('mouseleave', handleMouseLeave);

    // Store cleanup function for this mark
    cleanupFunctions.push(() => {
      mark.removeEventListener('mouseenter', handleMouseEnter);
      mark.removeEventListener('mousemove', handleMouseMove);
      mark.removeEventListener('mouseleave', handleMouseLeave);
      mark.classList.remove('chart-mark--highlighted');
    });
  });
  
  // Add global fallback handlers to prevent stuck tooltips
  const handleDocumentMouseLeave = (e: MouseEvent) => {
    // If mouse leaves the plot container, hide tooltip
    const rect = plot.getBoundingClientRect();
    const isOutside = (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
    
    if (isOutside) {
      hideTooltip();
    }
  };
  
  const handleDocumentClick = () => {
    // Hide tooltip on any click
    hideTooltip();
  };
  
  const handleScroll = () => {
    // Hide tooltip on scroll (tooltip position becomes invalid)
    hideTooltip();
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    // Hide tooltip on Escape key
    if (e.key === 'Escape') {
      hideTooltip();
    }
  };
  
  const handleWindowBlur = () => {
    // Hide tooltip when window loses focus
    hideTooltip();
  };
  
  // Add global listeners
  document.addEventListener('mousemove', handleDocumentMouseLeave);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('scroll', handleScroll, true); // useCapture for all scrolls
  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('blur', handleWindowBlur);
  
  // Add plot container leave handler as additional safety
  const handlePlotMouseLeave = () => {
    hideTooltip();
  };
  plot.addEventListener('mouseleave', handlePlotMouseLeave);
  
  // Return cleanup function that removes all listeners
  return () => {
    // Clean up mark listeners
    cleanupFunctions.forEach(cleanup => cleanup());
    
    // Clean up global listeners
    document.removeEventListener('mousemove', handleDocumentMouseLeave);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('scroll', handleScroll, true);
    document.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('blur', handleWindowBlur);
    plot.removeEventListener('mouseleave', handlePlotMouseLeave);
    
    // Final safety: hide tooltip on cleanup
    hideTooltip();
  };
}

// Memoize to prevent re-renders when options haven't changed
// CONSERVATIVE: Only skip render if options reference is identical
// This preserves performance for stable references while ensuring updates aren't missed
export default React.memo(ObservablePlot, (prevProps, nextProps) => {
  // Only skip if exact same object reference
  // Any new options object will trigger re-render
  return prevProps.options === nextProps.options;
}); 