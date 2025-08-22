import React, { useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';

interface ObservablePlotProps {
  options: Plot.PlotOptions;
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ options }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(true);
  const [forceRender, setForceRender] = useState(0);

  // ResizeObserver for dimension changes
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

  // IntersectionObserver to detect when chart comes into view during scrolling
  useEffect(() => {
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = isVisible;
          const nowVisible = entry.isIntersecting;
          setIsVisible(nowVisible);
          
          // Force re-render when element becomes visible after being invisible
          if (!wasVisible && nowVisible) {
            setForceRender(prev => prev + 1);
          }
        });
      },
      {
        // Use a small threshold to trigger when even a small part becomes visible
        threshold: 0.01,
        // Add some margin to trigger slightly before the element is fully visible
        rootMargin: '50px'
      }
    );

    if (containerRef.current) {
      intersectionObserver.observe(containerRef.current);
    }

    return () => {
      intersectionObserver.disconnect();
    };
  }, [isVisible]);

  // Chart rendering effect
  useEffect(() => {
    if (containerRef.current) {
      // Determine final plot dimensions, prioritizing explicit options over observed dimensions.
      const observedWidth = dimensions.width;
      const observedHeight = dimensions.height;
      const finalWidth = options.width !== undefined ? options.width : (observedWidth > 0 ? observedWidth : 400);
      const finalHeight = options.height !== undefined ? options.height : (observedHeight > 0 ? observedHeight : 300);

      // Only render if we have valid dimensions and the element is visible
      if (finalWidth > 0 && finalHeight > 0 && isVisible) {
        const newOptions = {
          ...options,
          width: finalWidth,
          height: finalHeight,
        };

        try {
          const plot = Plot.plot(newOptions);
          
          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(plot);
        } catch (error) {
          console.error('ObservablePlot - Error creating plot:', error);
        }
      }
    }
  }, [options, dimensions, isVisible, forceRender]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default ObservablePlot; 