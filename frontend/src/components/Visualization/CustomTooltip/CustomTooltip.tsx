import React, { useEffect, useRef, useState } from 'react';
import './CustomTooltip.css';

export interface TooltipField {
  label: string;
  value: string | number;
  formattedValue?: string;
}

interface CustomTooltipProps {
  x: number;
  y: number;
  fields: TooltipField[];
  visible: boolean;
}

/**
 * Custom HTML tooltip component with full CSS control.
 * Replaces Observable Plot's built-in SVG tooltips for better formatting.
 * Supports both normal and fullscreen modes.
 */
export const CustomTooltip: React.FC<CustomTooltipProps> = ({ 
  x, 
  y, 
  fields, 
  visible 
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number; anchor: string }>({ 
    x, 
    y, 
    anchor: 'right' 
  });

  // Smart positioning to prevent tooltip from going off-screen
  useEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    
    // Check if we're in fullscreen mode
    const fullscreenElement = (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ) as HTMLElement | null;

    // If in fullscreen, calculate bounds relative to fullscreen element
    // Otherwise, use viewport bounds
    const bounds = fullscreenElement 
      ? fullscreenElement.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    const viewportWidth = bounds.width;
    const viewportHeight = bounds.height;
    
    let newX = x;
    let newY = y;
    let anchor = 'right';

    // Adjust coordinates if in fullscreen to be relative to fullscreen element
    if (fullscreenElement) {
      newX = x - bounds.left;
      newY = y - bounds.top;
    }

    // Check horizontal overflow
    if (newX + rect.width + 15 > viewportWidth) {
      // Position to left of cursor
      anchor = 'left';
    }

    // Check vertical overflow
    if (newY + rect.height / 2 > viewportHeight) {
      // Move up
      newY = viewportHeight - rect.height / 2 - 10;
    } else if (newY - rect.height / 2 < 0) {
      // Move down
      newY = rect.height / 2 + 10;
    }

    setPosition({ x: newX, y: newY, anchor });
  }, [x, y, visible]);

  if (!visible || fields.length === 0) {
    return null;
  }

  return (
    <div 
      ref={tooltipRef}
      className={`custom-tooltip custom-tooltip--${position.anchor}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
      }}
    >
      {fields.map((field, idx) => (
        <div key={idx} className="custom-tooltip__row">
          <span className="custom-tooltip__label">{field.label}:</span>
          <span className="custom-tooltip__value">
            {field.formattedValue !== undefined ? field.formattedValue : field.value}
          </span>
        </div>
      ))}
    </div>
  );
};

