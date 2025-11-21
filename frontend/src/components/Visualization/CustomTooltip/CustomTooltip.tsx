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

  // Debug logging
  useEffect(() => {
    console.log('[CustomTooltip] Render:', { visible, x, y, fieldsCount: fields.length, fields });
  }, [visible, x, y, fields]);

  // Smart positioning to prevent tooltip from going off-screen
  useEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let newX = x;
    let newY = y;
    let anchor = 'right';

    // Check horizontal overflow
    if (x + rect.width + 15 > viewportWidth) {
      // Position to left of cursor
      anchor = 'left';
      newX = x;
    } else {
      // Position to right of cursor (default)
      newX = x;
    }

    // Check vertical overflow
    if (y + rect.height / 2 > viewportHeight) {
      // Move up
      newY = viewportHeight - rect.height / 2 - 10;
    } else if (y - rect.height / 2 < 0) {
      // Move down
      newY = rect.height / 2 + 10;
    }

    setPosition({ x: newX, y: newY, anchor });
  }, [x, y, visible]);

  if (!visible || fields.length === 0) {
    return null;
  }

  console.log('[CustomTooltip] Rendering tooltip at:', { x: position.x, y: position.y, anchor: position.anchor, fields });

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

