import React from 'react';
import * as Plot from '@observablehq/plot';
import ObservablePlot from '../ObservablePlot';
import { PlotResult } from '../../../observable-plot-generator/types';
import { MIN_GRID_ROW_PX, GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';

interface YAxesProps {
  spec: PlotResult;
  rows: number;
  dynamicYAxisPx: number;
  rowHeights: number[]; // actual track heights in px per row
  hasRowFacets: boolean;
}

/**
 * Build axis-only plot options for external gutters.
 */
function buildYAxisOptions(domain: any, gutterPx: number, type?: string, padding?: number) {
  const first = Array.isArray(domain) ? domain[0] : undefined;
  const isDateString = typeof first === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first);
  const isDateRange = Array.isArray(domain) && domain.length === 2 && 
    ((first instanceof Date || domain[1] instanceof Date) || isDateString);
  const isCategorical = type === 'band' || (Array.isArray(domain) && domain.length > 0 && typeof domain[0] !== 'number' && !isDateRange);
  return {
    frame: null,
    marginLeft: Math.max(12, gutterPx - 2),
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    inset: 0,
    x: { axis: null },
    y: { 
      label: '', 
      domain: domain ?? [0, 1], 
      type: isDateRange ? 'utc' : (isCategorical ? 'band' : undefined),
      labelArrow: null,
      nice: false,  // Match internal plot axis configuration for exact alignment
      ...(padding !== undefined && isCategorical ? { padding } : {}),  // Match internal band padding for bar positioning
    },
    marks: [Plot.axisY()],
  } as any;
}

const YAxes: React.FC<YAxesProps> = ({ spec, rows, dynamicYAxisPx, rowHeights, hasRowFacets }) => {
  return (
    <>
      {/* Left external y-axes gutter */}
      {Array.from({ length: rows }).map((_, r) => {
        const sample = (spec.plots || []).find((p: any) => p.position?.row === r);
        const yDomain = (sample as any)?.options?.y?.domain;
        const yType = (sample as any)?.options?.y?.type;
        const yPadding = (sample as any)?.options?.y?.padding;
        const trackHeightPx = Math.max(1, rowHeights[r] ?? MIN_GRID_ROW_PX);
        return (
          <div
            key={`y-axis-${r}`}
            style={{
              gridColumn: hasRowFacets ? 3 : 2,
              gridRow: r + 1,
              borderBottom: r < rows - 1 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
            }}
          >
            <ObservablePlot options={{ ...buildYAxisOptions(yDomain, dynamicYAxisPx, yType, yPadding), height: trackHeightPx }} />
          </div>
        );
      })}
    </>
  );
};

// Memoize to prevent re-renders when props haven't changed
// CONSERVATIVE: Check reference equality, re-render if changes detected
export default React.memo(YAxes, (prevProps, nextProps) => {
  // Check primitive props
  if (
    prevProps.rows !== nextProps.rows ||
    prevProps.dynamicYAxisPx !== nextProps.dynamicYAxisPx ||
    prevProps.hasRowFacets !== nextProps.hasRowFacets
  ) {
    return false;
  }
  
  // Check rowHeights array reference first (most common case)
  if (prevProps.rowHeights !== nextProps.rowHeights) {
    // If reference changed, check if values actually differ
    if (prevProps.rowHeights.length !== nextProps.rowHeights.length) {
      return false;
    }
    for (let i = 0; i < prevProps.rowHeights.length; i++) {
      if (prevProps.rowHeights[i] !== nextProps.rowHeights[i]) {
        return false;
      }
    }
  }
  
  // Check spec.plots reference
  if (prevProps.spec.plots !== nextProps.spec.plots) {
    return false;
  }
  
  return true;
});
