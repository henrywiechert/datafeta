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
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ options }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { tooltip, showTooltip, hideTooltip, updatePosition } = useChartTooltip();

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
    if (containerRef.current) {
      // Determine final plot dimensions, prioritizing explicit options over observed dimensions.
      const observedWidth = dimensions.width;
      const observedHeight = dimensions.height;
      const finalWidth = options.width !== undefined ? options.width : (observedWidth > 0 ? observedWidth : 400);
      const finalHeight = options.height !== undefined ? options.height : (observedHeight > 0 ? observedHeight : 300);



      // Only render if we have valid dimensions to prevent errors.
      if (finalWidth > 0 && finalHeight > 0) {
        const newOptions = {
          ...options,
          width: finalWidth,
          height: finalHeight,
          // Avoid clipping of tooltips beyond the plot frame
          style: { ...(options as any).style, overflow: 'visible' } as any,
        } as Plot.PlotOptions;

        try {
          const plot = Plot.plot(newOptions);
          
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(plot);

          // Add custom tooltip event listeners if configured
          const customTooltipConfig = options.__customTooltip;
          if (customTooltipConfig?.enabled) {
            addTooltipListeners(plot, customTooltipConfig, showTooltip, hideTooltip, updatePosition);
          }
        } catch (error) {
          console.error('ObservablePlot - Error creating plot:', error);
        }
      }
    }
  }, [options, dimensions, showTooltip, hideTooltip, updatePosition]);

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Render tooltip at document body level using portal to avoid container clipping */}
      {ReactDOM.createPortal(
        <CustomTooltip
          x={tooltip.x}
          y={tooltip.y}
          fields={tooltip.fields}
          visible={tooltip.visible}
        />,
        document.body
      )}
    </>
  );
};

/**
 * Add tooltip event listeners to Observable Plot marks.
 * Extracts data from marks and displays custom tooltip on hover.
 */
function addTooltipListeners(
  plot: SVGSVGElement | HTMLElement,
  config: CustomTooltipConfig,
  showTooltip: (x: number, y: number, fields: TooltipField[]) => void,
  hideTooltip: () => void,
  updatePosition: (x: number, y: number) => void
): void {
  // Find all interactive marks (circles, rects, paths with fill)
  // Observable Plot typically uses these elements for data visualization
  const marks = plot.querySelectorAll('circle, rect, path[fill]:not([fill="none"])');

  console.log(`[CustomTooltip] Found ${marks.length} marks to attach tooltips to`);

  marks.forEach((mark, index) => {
    // Observable Plot stores data on elements via __data__ property
    const element = mark as any;
    
    const handleMouseEnter = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      
      // Try multiple ways to get data:
      // 1. From __data__ property (D3 style)
      // 2. From our data array if provided
      let data = element.__data__;
      
      console.log(`[CustomTooltip] Mark ${index} - Raw __data__:`, element.__data__);
      console.log(`[CustomTooltip] Mark ${index} - Type of __data__:`, typeof element.__data__);
      
      if (!data && config.data && config.data.length > 0) {
        // Fallback: use data array index if available
        // This assumes marks are in same order as data
        if (index < config.data.length) {
          data = config.data[index];
          console.log(`[CustomTooltip] Mark ${index} - Using fallback data from array[${index}]:`, data);
        }
      }
      
      // If __data__ is a number (index), it might be storing the index instead of actual data
      if (typeof data === 'number' && config.data && data < config.data.length) {
        console.log(`[CustomTooltip] Mark ${index} - __data__ is number ${data}, using as index into data array`);
        data = config.data[data];
      }
      
      console.log(`[CustomTooltip] Mouse enter on mark ${index}:`, {
        hasData: !!data,
        dataType: typeof data,
        data: data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        element: element,
        __data__: element.__data__,
        configDataLength: config.data?.length,
        configDataSample: config.data?.[0],
        configEnabled: config.enabled
      });
      
      if (data) {
        try {
          const fields = config.getFields(data);
          console.log('[CustomTooltip] Generated fields:', fields);
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
      console.log('[CustomTooltip] Mouse leave');
      hideTooltip();
    };

    mark.addEventListener('mouseenter', handleMouseEnter);
    mark.addEventListener('mousemove', handleMouseMove);
    mark.addEventListener('mouseleave', handleMouseLeave);

    // Store event listeners for potential cleanup
    (mark as any)._tooltipListeners = {
      mouseenter: handleMouseEnter,
      mousemove: handleMouseMove,
      mouseleave: handleMouseLeave,
    };
  });
}

export default ObservablePlot; 