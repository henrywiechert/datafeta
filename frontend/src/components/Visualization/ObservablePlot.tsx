import React, { useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';

interface ObservablePlotProps {
  options: Plot.PlotOptions;
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ options }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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
      const finalWidth = options.width !== undefined ? options.width : dimensions.width;
      const finalHeight = options.height !== undefined ? options.height : dimensions.height;

      // Only render if we have valid dimensions to prevent errors.
      if (finalWidth > 0 && finalHeight > 0) {
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
  }, [options, dimensions]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default ObservablePlot; 