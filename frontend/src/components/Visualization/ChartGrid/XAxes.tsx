import React, { useState, useCallback } from 'react';
import * as Plot from '@observablehq/plot';
import ObservablePlot from '../ObservablePlot';
import { PlotResult } from '../../../observable-plot-generator/types';
import { GRID_DIVIDER_COLOR, X_LABEL_ROW_PX } from '../../../config/chartLayoutConfig';
import AxisLabel from './AxisLabel';
import AxisLabelStylePopover from './AxisLabelStylePopover';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { XAxisLabelStyle } from '../../../contexts/VisualizationContext/types';

interface XAxesProps {
  spec: PlotResult;
  columns: number;
  plotTemplateColumns: string;
  totalContentWidthPx: number;
  dynamicXAxisPx: number;
}

function buildXAxisOptions(label: string | undefined, domain: any, gutterPx: number, type?: string, padding?: number) {
  // If the plot spec explicitly says 'band', respect that - it's a categorical axis
  // regardless of whether the values look like dates
  const isCategorical = type === 'band';
  
  // Only treat as continuous date range if NOT explicitly band type
  const first = Array.isArray(domain) ? domain[0] : undefined;
  const isDateString = typeof first === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first);
  const isDateRange = !isCategorical && Array.isArray(domain) && domain.length === 2 && 
    ((first instanceof Date || domain[1] instanceof Date) || isDateString);
  
  // For categorical band scales with many items (like timeline timestamps), 
  // limit the number of ticks to avoid overcrowding
  const domainLength = Array.isArray(domain) ? domain.length : 0;
  const maxTicksForBand = isCategorical && domainLength > 10 ? Math.min(20, Math.ceil(domainLength / 2)) : undefined;
  
  return {
    frame: null,
    height: Math.max(16, gutterPx),
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: Math.max(12, gutterPx - 2),
    inset: 0,
    y: { axis: null },
    x: { 
      label: '', 
      domain: domain ?? [0, 1], 
      type: isCategorical ? 'band' : (isDateRange ? 'utc' : undefined),
      labelArrow: null,
      nice: false,  // Match internal plot axis configuration for exact alignment
      ...(padding !== undefined && isCategorical ? { padding } : {}),  // Match internal band padding for bar positioning
      ...(maxTicksForBand ? { ticks: maxTicksForBand } : {}),  // Limit ticks for large categorical domains
    }, 
    marks: [Plot.axisX()],
  } as any;
}

const XAxes: React.FC<XAxesProps> = ({
  spec,
  columns,
  plotTemplateColumns,
  totalContentWidthPx,
  dynamicXAxisPx,
}) => {
  // Get axis label styles from context
  const { state, dispatch } = useVisualizationContext();
  const { axisLabelStyles } = state;

  // Popover state for X-axis label styling
  const [xLabelPopoverAnchor, setXLabelPopoverAnchor] = useState<HTMLElement | null>(null);

  const handleXLabelClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setXLabelPopoverAnchor(event.currentTarget);
  }, []);

  const handleXLabelPopoverClose = useCallback(() => {
    setXLabelPopoverAnchor(null);
  }, []);

  const handleXLabelStyleChange = useCallback((updates: Partial<XAxisLabelStyle>) => {
    dispatch({ type: 'SET_X_AXIS_LABEL_STYLE', payload: updates });
  }, [dispatch]);

  return (
    <>
      {/* Bottom X scales */}
      <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 3 : 2 }}>
        {(() => {
          const colSizes = spec.layout?.columnSizes as Array<number | 'fr'> | undefined;
          const hasFlexible = !colSizes || colSizes.some((c) => typeof c !== 'number');
          const containerWidthStyle = hasFlexible ? '100%' : `${totalContentWidthPx}px`;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, minWidth: `${totalContentWidthPx}px`, width: containerWidthStyle }}>
              {Array.from({ length: columns }).map((_, c) => {
                const sample = (spec.plots || []).find((p: any) => p.position?.col === c);
                const xLabel = (sample as any)?.options?.x?.label;
                const xDomain = (sample as any)?.options?.x?.domain;
                const xType = (sample as any)?.options?.x?.type;
                const xPadding = (sample as any)?.options?.x?.padding;
                const xRotate = xType === 'band' ? -45 : 0;
                return (
                  <div
                    key={`x-axis-${c}`}
                    style={{
                      gridColumn: c + 1,
                      borderRight: c < columns - 1 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
                      borderTop: `1px solid ${GRID_DIVIDER_COLOR}`,
                    }}
                  >
                    <ObservablePlot options={{ ...buildXAxisOptions(xLabel, xDomain, dynamicXAxisPx, xType, xPadding), marks: [Plot.axisX({ tickRotate: xRotate as any })] as any }} />
                  </div>
                );
              })}
            </div>
          );
        })()}
        
      </div>

      {/* Bottom X labels */}
      <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 5 : 4 }}>
        {(() => {
          const colSizes = spec.layout?.columnSizes as Array<number | 'fr'> | undefined;
          const hasFlexible = !colSizes || colSizes.some((c) => typeof c !== 'number');
          const containerWidthStyle = hasFlexible ? '100%' : `${totalContentWidthPx}px`;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns, minWidth: `${totalContentWidthPx}px`, width: containerWidthStyle }}>
              {Array.from({ length: columns }).map((_, c) => {
                const sample = (spec.plots || []).find((p: any) => p.position?.col === c);
                const xLabel = (sample as any)?.options?.x?.label as string | undefined;
                return (
                  <div
                    key={`x-label-${c}`}
                    style={{
                      gridColumn: c + 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2px',
                      textAlign: 'center',
                      minHeight: `${X_LABEL_ROW_PX}px`,
                    }}
                  >
                    <AxisLabel
                      label={xLabel || ''}
                      axis="x"
                      style={axisLabelStyles.xAxis}
                      onClick={handleXLabelClick}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}
        
      </div>

      {/* X-axis label style popover */}
      <AxisLabelStylePopover
        anchorEl={xLabelPopoverAnchor}
        onClose={handleXLabelPopoverClose}
        axis="x"
        style={axisLabelStyles.xAxis}
        onChange={handleXLabelStyleChange}
      />
    </>
  );
};

// Memoize to prevent re-renders when props haven't changed
// CONSERVATIVE: Check reference equality, re-render if any key reference changes
export default React.memo(XAxes, (prevProps, nextProps) => {
  return (
    prevProps.columns === nextProps.columns &&
    prevProps.plotTemplateColumns === nextProps.plotTemplateColumns &&
    prevProps.totalContentWidthPx === nextProps.totalContentWidthPx &&
    prevProps.dynamicXAxisPx === nextProps.dynamicXAxisPx &&
    prevProps.spec.plots === nextProps.spec.plots &&
    prevProps.spec.facetLabels === nextProps.spec.facetLabels &&
    prevProps.spec.layout === nextProps.spec.layout
  );
});
