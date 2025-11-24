# Custom React Tooltip Implementation Design

## Solution 2: Full HTML/CSS Tooltip System

### Architecture

```
ObservablePlot Component
    ↓
    Renders Observable Plot SVG
    ↓
    Adds mouse event listeners to SVG
    ↓
    On hover: Updates tooltip state
    ↓
    CustomTooltip Component (conditionally rendered)
    ↓
    Positioned via absolute positioning
```

## Implementation Files

### 1. `CustomTooltip.tsx`

```typescript
import React from 'react';
import './CustomTooltip.css';

interface TooltipField {
  label: string;
  value: string | number;
  type?: 'dimension' | 'measure' | 'metadata';
}

interface CustomTooltipProps {
  x: number;
  y: number;
  fields: TooltipField[];
  visible: boolean;
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({ 
  x, y, fields, visible 
}) => {
  if (!visible || fields.length === 0) return null;

  return (
    <div 
      className="custom-tooltip"
      style={{
        left: x,
        top: y,
        transform: 'translate(10px, -50%)', // Offset from cursor
      }}
    >
      {fields.map((field, idx) => (
        <div key={idx} className="tooltip-row">
          <span className="tooltip-label">{field.label}:</span>
          <span className="tooltip-value">{field.value}</span>
        </div>
      ))}
    </div>
  );
};
```

### 2. `CustomTooltip.css`

```css
.custom-tooltip {
  position: fixed;
  pointer-events: none;
  z-index: 10000;
  
  /* Styling */
  background: rgba(20, 20, 20, 0.95);
  color: white;
  padding: 10px 14px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  
  /* Typography */
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  line-height: 1.6;
  
  /* Animation */
  animation: fadeIn 0.15s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tooltip-row {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.tooltip-label {
  font-weight: bold;  /* TRUE BOLD */
  color: #ffffff;
}

.tooltip-value {
  font-weight: normal;
  color: #e0e0e0;
}

/* Prevent tooltip from going off-screen */
.custom-tooltip[data-anchor="left"] {
  transform: translate(-100%, -50%) translate(-10px, 0);
}

.custom-tooltip[data-anchor="top"] {
  transform: translate(-50%, -100%) translate(0, -10px);
}

.custom-tooltip[data-anchor="bottom"] {
  transform: translate(-50%, 0) translate(0, 10px);
}
```

### 3. `useChartTooltip.ts`

```typescript
import { useState, useCallback, RefObject } from 'react';

interface TooltipField {
  label: string;
  value: string | number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  fields: TooltipField[];
}

export function useChartTooltip(containerRef: RefObject<HTMLDivElement>) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    fields: [],
  });

  const showTooltip = useCallback((
    event: MouseEvent,
    data: any,
    fieldConfig: { label: string; accessor: (d: any) => any }[]
  ) => {
    const fields = fieldConfig.map(config => ({
      label: config.label,
      value: config.accessor(data),
    }));

    setTooltip({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      fields,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const updatePosition = useCallback((event: MouseEvent) => {
    setTooltip(prev => ({
      ...prev,
      x: event.clientX,
      y: event.clientY,
    }));
  }, []);

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    updatePosition,
  };
}
```

### 4. Modify `ObservablePlot.tsx`

```typescript
import React, { useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
import { CustomTooltip } from './CustomTooltip';
import { useChartTooltip } from '../hooks/useChartTooltip';

interface ObservablePlotProps {
  options: Plot.PlotOptions;
  // New props for custom tooltips
  enableCustomTooltip?: boolean;
  tooltipFields?: { label: string; accessor: (d: any) => any }[];
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({ 
  options, 
  enableCustomTooltip = true,
  tooltipFields = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const { tooltip, showTooltip, hideTooltip, updatePosition } = useChartTooltip(containerRef);

  useEffect(() => {
    // Existing resize observer code...
  }, []);

  useEffect(() => {
    if (containerRef.current && dimensions.width > 0 && dimensions.height > 0) {
      // Create plot
      const plot = Plot.plot({
        ...options,
        width: dimensions.width,
        height: dimensions.height,
      });

      // Clear and append
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(plot);
      plotRef.current = plot;

      // Add custom tooltip listeners if enabled
      if (enableCustomTooltip && tooltipFields.length > 0) {
        // Find all data marks (circles, rects, etc.)
        const marks = plot.querySelectorAll('circle, rect, path[fill]');
        
        marks.forEach((mark) => {
          // Get data bound to this element (Observable Plot stores it)
          const dataIndex = mark.getAttribute('data-index');
          
          mark.addEventListener('mouseenter', (e: Event) => {
            const mouseEvent = e as MouseEvent;
            const data = getDataForMark(mark); // Helper to extract data
            if (data) {
              showTooltip(mouseEvent, data, tooltipFields);
            }
          });

          mark.addEventListener('mousemove', (e: Event) => {
            updatePosition(e as MouseEvent);
          });

          mark.addEventListener('mouseleave', () => {
            hideTooltip();
          });
        });
      }
    }
  }, [options, dimensions, enableCustomTooltip, tooltipFields, showTooltip, hideTooltip, updatePosition]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {enableCustomTooltip && (
        <CustomTooltip
          x={tooltip.x}
          y={tooltip.y}
          fields={tooltip.fields}
          visible={tooltip.visible}
        />
      )}
    </div>
  );
};

export default ObservablePlot;
```

## Integration with Chart Types

Each chart type (scatter, line, bar, tickStrip) would need to:

1. **Disable Observable Plot's built-in tooltip**:
```typescript
// Remove or set to false:
dotConfig.tip = false;
```

2. **Pass tooltip field configuration**:
```typescript
const tooltipConfig = [
  { label: xLabel, accessor: (d: any) => d[xColumn] },
  { label: yLabel, accessor: (d: any) => d[yColumn] },
  { label: colorField?.columnName, accessor: (d: any) => d[colorColumnName] },
  // ... more fields
];
```

3. **Enable custom tooltip in plot options**:
```typescript
return {
  ...plotOptions,
  __customTooltip: {
    enabled: true,
    fields: tooltipConfig,
  }
};
```

## Advanced Features

### Conditional Formatting
```typescript
<span 
  className="tooltip-value" 
  style={{ color: field.value < 0 ? 'red' : 'green' }}
>
  {field.value}
</span>
```

### Multi-column Layout
```css
.tooltip-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}
```

### Grouped Sections
```typescript
<div className="custom-tooltip">
  <div className="tooltip-section">
    <div className="section-header">Dimensions</div>
    {dimensionFields.map(...)}
  </div>
  <div className="tooltip-section">
    <div className="section-header">Measures</div>
    {measureFields.map(...)}
  </div>
</div>
```

### Smart Positioning
```typescript
// Detect if tooltip goes off screen
const rect = tooltipElement.getBoundingClientRect();
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;

if (rect.right > viewportWidth) {
  // Position to left of cursor
}
if (rect.bottom > viewportHeight) {
  // Position above cursor
}
```

## Pros & Cons

### Pros
- ✅ True bold labels with HTML/CSS
- ✅ Complete control over layout
- ✅ Consistent with React architecture
- ✅ Easy to extend with new features
- ✅ Better accessibility (ARIA attributes)
- ✅ Animations and transitions

### Cons
- ⚠️ More code to maintain (~400 lines)
- ⚠️ Need to handle edge cases (off-screen, multiple charts)
- ⚠️ Performance consideration for many data points
- ⚠️ Need to sync with Observable Plot's data

## Migration Path

1. Create new components (non-breaking)
2. Add feature flag to enable/disable
3. Test with one chart type first
4. Roll out to all chart types
5. Eventually deprecate Observable Plot's built-in tooltips

## Estimated Timeline

- Day 1: Core tooltip component + hook (4-6 hours)
- Day 2: Integration with ObservablePlot component (2-3 hours)
- Day 3: Update chart types, testing (3-4 hours)
- Day 4: Edge cases, polish, responsive positioning (2-3 hours)

Total: **2-3 days of development**

