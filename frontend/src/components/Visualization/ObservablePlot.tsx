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
    if (dimensions.width > 0 && dimensions.height > 0 && containerRef.current) {
      const newOptions = {
        ...options,
        width: options.width || dimensions.width,
        height: options.height || dimensions.height,
      };

      const plot = Plot.plot(newOptions);
      
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(plot);
    }
  }, [options, dimensions]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default ObservablePlot; 