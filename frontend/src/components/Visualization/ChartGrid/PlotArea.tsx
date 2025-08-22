import React from 'react';
import * as Plot from '@observablehq/plot';
import { PlotResult } from '../../../observable-plot-generator/types';
import ObservablePlot from '../ObservablePlot';
import styles from './ChartGrid.module.css';

interface PlotAreaProps {
  spec: PlotResult;
  plotsTranslateRef: React.RefObject<HTMLDivElement>;
  plotTemplateColumns: string;
  plotRowsSpec: string;
  totalContentWidthPx: number;
}

/**
 * Remove axis labels (preserve grid). For external axes we also disable the axis lines.
 */
function suppressAxes(options: any, hideX: boolean, hideY: boolean) {
  const next = { ...options };
  // Remove all margins so plot fills the cell exactly
  next.marginLeft = 0;
  next.marginRight = 0;
  next.marginTop = 0;
  next.marginBottom = 0;
  next.inset = 0;
  if (hideX) {
    next.x = {
      ...(next.x || {}),
      label: '',
      axis: null,
      grid: true,
    };
  }
  if (hideY) {
    next.y = {
      ...(next.y || {}),
      label: '',
      axis: null,
      grid: true,
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
  return (
    <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 2 : 1, overflow: 'hidden', position: 'relative' }}>
      <div
        ref={plotsTranslateRef}
        style={{
          display: 'grid',
          gridTemplateColumns: plotTemplateColumns,
          gridTemplateRows: plotRowsSpec,
          minWidth: `${totalContentWidthPx}px`,
          willChange: 'transform',
        }}
      >
        {(spec.plots || []).map((plot: { id: string, position?: { row: number, col: number }, options: Plot.PlotOptions }, index: number) => {
          const key = plot.id || String(index);
          const pos = plot.position;
          const gridItemStyle: React.CSSProperties | undefined = pos
            ? {
                gridColumn: pos.col + 1,
                gridRow: pos.row + 1,
                borderRight: '1px solid #99a795',
                borderBottom: '1px solid #99a795',
              }
            : undefined;
          const opts = suppressAxes(plot.options, true, true);
          return (
            <div key={key} className={styles.plotWrapper} style={gridItemStyle}>
              <div className={styles.observablePlotContainer}>
                <ObservablePlot options={opts} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlotArea;
