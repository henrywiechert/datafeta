import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import * as Plot from '@observablehq/plot';
import { CustomTooltip } from './CustomTooltip/CustomTooltip';
import { useChartTooltip } from '../../hooks/useChartTooltip';
import { CustomTooltipConfig } from '../../types';
import { addTooltipListeners } from './CustomTooltip/addTooltipListeners';

interface ObservablePlotProps {
  options: Plot.PlotOptions & {
    __customTooltip?: CustomTooltipConfig;
  };
  plotId?: string; // Unique ID for tracking rendering
  onRenderComplete?: (plotId: string) => void; // Callback when rendering is done
  onPlotReady?: (plot: SVGSVGElement | HTMLElement) => void;
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ options, plotId, onRenderComplete, onPlotReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(document.body);
  const { tooltip, showTooltip, hideTooltip, updatePosition, pinTooltip, unpinTooltip, pinnedRef } = useChartTooltip();
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

        onPlotReady?.(plot);

        // Add custom tooltip event listeners if configured
        const customTooltipConfig = options.__customTooltip;
        if (customTooltipConfig?.enabled) {
          const cleanup = addTooltipListeners(
            plot, customTooltipConfig, showTooltip, hideTooltip, updatePosition,
            pinTooltip, unpinTooltip, pinnedRef
          );
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
  }, [options, dimensions, showTooltip, hideTooltip, updatePosition, pinTooltip, unpinTooltip, pinnedRef, onRenderComplete, plotId, onPlotReady]);

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
          colorHex={tooltip.colorHex}
          pinned={tooltip.pinned}
          onUnpin={unpinTooltip}
          onFilterAction={options.__customTooltip?.onFilterAction}
        />,
        portalTarget
      )}
    </>
  );
};

// Memoize to prevent re-renders when options haven't changed
// CONSERVATIVE: Only skip render if options reference is identical
// This preserves performance for stable references while ensuring updates aren't missed
export default React.memo(ObservablePlot, (prevProps, nextProps) => {
  // Only skip if exact same object reference
  // Any new options object will trigger re-render
  return prevProps.options === nextProps.options;
}); 