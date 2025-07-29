import React, { useEffect, useRef } from 'react';

interface ObservablePlotProps {
  plot: Element;
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ plot }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = ''; // Clear previous plot
      containerRef.current.appendChild(plot);
    }
  }, [plot]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default ObservablePlot; 