import React from 'react';
import * as Plot from '@observablehq/plot';
import { PlotResult } from '../../../observable-plot-generator/types';
import ObservablePlot from '../ObservablePlot';
import styles from './ChartGrid.module.css';
import { GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';

interface PlotAreaProps {
  spec: PlotResult;
  plotsTranslateRef: React.RefObject<HTMLDivElement>;
  plotTemplateColumns: string;
  plotRowsSpec: string;
  totalContentWidthPx: number;
}

/**
 * Remove axis labels and axis rendering for external axis display.
 * Preserve grid on measure axes (stable positioning) but disable on category axes (would shift with padding).
 * Force all margins and insets to 0 so plots fill cells exactly with no offset.
 */
function suppressAxes(options: any, hideX: boolean, hideY: boolean) {
  const next = { ...options };
  // Force all margins and insets to 0 - don't preserve any defaults
  next.marginLeft = 0;
  next.marginRight = 0;
  next.marginTop = 0;
  next.marginBottom = 0;
  next.inset = 0;
  next.insetLeft = 0;
  next.insetRight = 0;
  next.insetTop = 0;
  next.insetBottom = 0;
  
  if (hideX) {
    next.x = {
      ...(next.x || {}),
      label: '',
      axis: false,
      // Preserve grid setting from original options (measure axes should have grid, category axes should not)
    };
  }
  if (hideY) {
    next.y = {
      ...(next.y || {}),
      label: '',
      axis: false,
      // Preserve grid setting from original options (measure axes should have grid, category axes should not)
    };
  }
  return next;
}

const PlotArea: React.FC<PlotAreaProps> = ({
  spec,
  plotsTranslateRef,
  plotTemplateColumns,
  plotRowsSpec,
  totalContentWidthPx,
}) => {
  // Debug logging disabled for performance with large faceted grids
  
  return (
    <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 2 : 1, overflow: 'hidden', position: 'relative' }}>
      <div
        ref={plotsTranslateRef}
        style={{
          display: 'grid',
          gridTemplateColumns: plotTemplateColumns,
          gridTemplateRows: plotRowsSpec,
          minWidth: `${totalContentWidthPx}px`,
          width: (() => {
            const sizes = (spec.layout as any)?.columnSizes as Array<number | 'fr'> | undefined;
            const hasFlexible = !sizes || sizes.some((c) => typeof c !== 'number');
            return hasFlexible ? '100%' : `${totalContentWidthPx}px`;
          })(),
          willChange: 'transform',
        }}
      >
        {(spec.plots || []).map((plot: { id: string, position?: { row: number, col: number }, options: Plot.PlotOptions }, index: number) => {
          // Use plot.id as base key
          const key = plot.id || String(index);
          const pos = plot.position;
          const gridItemStyle: React.CSSProperties | undefined = pos
            ? {
                gridColumn: pos.col + 1,
                gridRow: pos.row + 1,
                borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
                borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
              }
            : undefined;
          const opts = suppressAxes(plot.options, true, true);
          
          // CRITICAL: Pass key directly to ObservablePlot to force re-mount on data changes
          // The key prop isn't officially on ObservablePlot but React uses it for reconciliation
          return (
            <div key={key} className={styles.plotWrapper} style={gridItemStyle}>
              <div className={styles.observablePlotContainer}>
                <ObservablePlot key={key} options={opts} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when props haven't changed
// CONSERVATIVE: Be more lenient to avoid missing updates
export default React.memo(PlotArea, (prevProps, nextProps) => {
  // Compare primitive props
  if (
    prevProps.plotTemplateColumns !== nextProps.plotTemplateColumns ||
    prevProps.plotRowsSpec !== nextProps.plotRowsSpec ||
    prevProps.totalContentWidthPx !== nextProps.totalContentWidthPx
  ) {
    return false;
  }
  
  // Compare spec.plots reference - if different, always re-render
  // This is conservative but ensures we don't miss updates
  if (prevProps.spec.plots !== nextProps.spec.plots) {
    return false;
  }
  
  // If facetLabels reference changed, re-render
  if (prevProps.spec.facetLabels !== nextProps.spec.facetLabels) {
    return false;
  }
  
  // If layout reference changed, re-render
  if (prevProps.spec.layout !== nextProps.spec.layout) {
    return false;
  }
  
  // All references are stable, skip re-render
  return true;
});
