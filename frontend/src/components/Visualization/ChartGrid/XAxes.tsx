import React from 'react';
import * as Plot from '@observablehq/plot';
import ObservablePlot from '../ObservablePlot';
import { PlotResult } from '../../../observable-plot-generator/types';
import { MIN_GRID_COLUMN_PX } from '../../../config/chartLayoutConfig';

interface XAxesProps {
  spec: PlotResult;
  columns: number;
  plotTemplateColumns: string;
  totalContentWidthPx: number;
  dynamicXAxisPx: number;
}

function buildXAxisOptions(label: string | undefined, domain: any, gutterPx: number, type?: string) {
  const isCategorical = type === 'band' || (Array.isArray(domain) && domain.length > 0 && typeof domain[0] !== 'number');
  return {
    frame: null,
    height: Math.max(16, gutterPx),
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: Math.max(12, gutterPx - 2),
    inset: 0,
    y: { axis: null },
    x: { label: '', domain: domain ?? [0, 1], ...(isCategorical ? { type: 'band' as any } : {}), labelArrow: null }, // label rendered in separate row below
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
                const xRotate = xType === 'band' ? -45 : 0;
                const trackWidthPx = (() => {
                  const sizes = spec.layout?.columnSizes as Array<number | 'fr'> | undefined;
                  if (sizes && sizes[c] !== undefined) {
                    const v = sizes[c];
                    return typeof v === 'number' ? v : MIN_GRID_COLUMN_PX;
                  }
                  return MIN_GRID_COLUMN_PX;
                })();
                return (
                  <div
                    key={`x-axis-${c}`}
                    style={{
                      gridColumn: c + 1,
                      borderRight: c < columns - 1 ? '1px solid #99a795' : undefined,
                      borderTop: `1px solid #99a795`,
                    }}
                  >
                    <ObservablePlot options={{ ...buildXAxisOptions(xLabel, xDomain, dynamicXAxisPx, xType), width: trackWidthPx, marks: [Plot.axisX({ tickRotate: xRotate as any })] as any }} />
                  </div>
                );
              })}
            </div>
          );
        })()}
        
      </div>

      {/* Bottom X labels */}
      <div style={{ gridColumn: 1, gridRow: spec.facetLabels ? 4 : 3 }}>
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
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: '2px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
                        lineHeight: '1.2',
                      }}
                    >
                      {xLabel || ''}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
        
      </div>
    </>
  );
};

export default XAxes;
