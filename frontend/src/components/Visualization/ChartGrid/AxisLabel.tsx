import React from 'react';
import { XAxisLabelStyle, YAxisLabelStyle } from '../../../contexts/VisualizationContext/types';

export interface AxisLabelProps {
  /** The label text to display */
  label: string;
  /** Which axis this label belongs to */
  axis: 'x' | 'y';
  /** Style configuration for the label */
  style: XAxisLabelStyle | YAxisLabelStyle;
  /** Click handler to open the style popover */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * AxisLabel - Renders an axis label with configurable styling
 * 
 * Supports:
 * - Horizontal, vertical, and angled orientations
 * - Configurable font size
 * - Click interaction to open styling popover
 */
const AxisLabel: React.FC<AxisLabelProps> = ({ label, axis, style, onClick }) => {
  if (!label) {
    return null;
  }

  const { fontSize, orientation } = style;

  // Compute writing mode and transform based on orientation
  let writingMode: React.CSSProperties['writingMode'] = 'horizontal-tb';
  let transform: string = 'none';
  let textAlign: React.CSSProperties['textAlign'] = 'center';

  switch (orientation) {
    case 'vertical':
      writingMode = 'vertical-rl';
      transform = 'rotate(180deg)';
      break;
    case 'angled':
      // Angled is only supported for X-axis
      writingMode = 'horizontal-tb';
      transform = 'rotate(-45deg)';
      textAlign = 'right';
      break;
    case 'horizontal':
    default:
      writingMode = 'horizontal-tb';
      transform = 'none';
      break;
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      title={onClick ? 'Click to edit label style' : undefined}
    >
      <div
        style={{
          writingMode,
          transform,
          textAlign,
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          lineHeight: '1.2',
          maxWidth: axis === 'x' && orientation === 'horizontal' ? '100%' : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: orientation === 'horizontal' && axis === 'x' ? 'nowrap' : 'normal',
        }}
      >
        {label}
      </div>
    </div>
  );
};

export default React.memo(AxisLabel);
