import React from 'react';
import * as Plot from '@observablehq/plot';
import ObservablePlot from '../ObservablePlot';
import { PlotResult } from '../../../observable-plot-generator/types';
import { MIN_GRID_ROW_PX } from '../../../config/chartLayoutConfig';

interface YAxesProps {
  spec: PlotResult;
  rows: number;
  dynamicYAxisPx: number;
  rowHeights: number[]; // actual track heights in px per row
}

/**
 * Build axis-only plot options for external gutters.
 */
function buildYAxisOptions(domain: any, gutterPx: number, type?: string) {
  const isCategorical = type === 'band' || (Array.isArray(domain) && domain.length > 0 && typeof domain[0] !== 'number');
  return {
    frame: null,
    marginLeft: Math.max(12, gutterPx - 2),
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    inset: 0,
    x: { axis: null },
    y: { label: '', domain: domain ?? [0, 1], ...(isCategorical ? { type: 'band' as any } : {}), labelArrow: null },
    marks: [Plot.axisY()],
  } as any;
}

const YAxes: React.FC<YAxesProps> = ({ spec, rows, dynamicYAxisPx, rowHeights }) => {
  return (
    <>
      {/* Left external y-axes gutter */}
      {Array.from({ length: rows }).map((_, r) => {
        const sample = (spec.plots || []).find((p: any) => p.position?.row === r);
        const yDomain = (sample as any)?.options?.y?.domain;
        const yType = (sample as any)?.options?.y?.type;
        const trackHeightPx = Math.max(1, rowHeights[r] ?? MIN_GRID_ROW_PX);
        return (
          <div
            key={`y-axis-${r}`}
            style={{
              gridColumn: spec.facetLabels ? 3 : 2,
              gridRow: r + 1,
              borderBottom: r < rows - 1 ? '1px solid #99a795' : undefined,
            }}
          >
            <ObservablePlot options={{ ...buildYAxisOptions(yDomain, dynamicYAxisPx, yType), height: trackHeightPx }} />
          </div>
        );
      })}
    </>
  );
};

export default YAxes;
