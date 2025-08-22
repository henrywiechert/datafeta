import React from 'react';
import { PlotResult } from '../../../observable-plot-generator/types';

interface FacetLabelsProps {
  spec: PlotResult;
  plotTemplateColumns: string;
  plotRowsSpec: string;
  baseCols: number;
  baseRows: number;
}

const dividerColor = '#99a795';
const VALUES_BAND_TOP_PX = 20;
const NAMES_BAND_LEFT_PX = 20;
const VALUES_BAND_LEFT_PX = 20;

export const TopFacetLabels: React.FC<Pick<FacetLabelsProps, 'spec' | 'plotTemplateColumns' | 'baseCols'>> = ({
  spec,
  plotTemplateColumns,
  baseCols,
}) => {
  const colLevels = spec.facetLabels?.colsLevels || [];
  if (colLevels.length === 0) return null;

  return (
    <div style={{ gridColumn: 1, gridRow: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              position: 'sticky',
              left: 0,
              right: 0,
              margin: '0 auto',
              width: 'max-content',
              fontSize: '12px',
              fontWeight: 600,
              background: 'white',
              padding: '2px 6px',
              zIndex: 2,
            }}
          >
            {colLevels.map((l: { fieldLabel: string }) => l.fieldLabel).join(' / ')}
          </div>
        </div>
        {colLevels.map((level: { values: any[] }, levelIdx: number) => {
          const counts = colLevels.map((l: { values: any[] }) => l.values.length);
          const innerProduct = counts.slice(levelIdx + 1).reduce((a: number, b: number) => a * b, 1) || 1;
          const outerProduct = counts.slice(0, levelIdx).reduce((a: number, b: number) => a * b, 1) || 1;
          const span = baseCols * innerProduct;
          const groupSpan = span * level.values.length;
          const cells: React.ReactNode[] = [];
          for (let r = 0; r < outerProduct; r++) {
            const groupStart = r * groupSpan;
            level.values.forEach((val: any, i: number) => {
              const startCol = 1 + groupStart + i * span;
              cells.push(
                <div
                  key={`col-level-${levelIdx}-seg-${r}-val-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: `${VALUES_BAND_TOP_PX}px`,
                    gridColumn: `${startCol} / span ${span}`,
                    background: 'transparent',
                    borderBottom: `1px solid ${dividerColor}`,
                    borderRight: `1px solid ${dividerColor}`,
                    fontSize: '10px',
                    padding: 0,
                    overflow: 'hidden',
                  }}
                >
                  {String(val)}
                </div>
              );
            });
          }
          return <React.Fragment key={`col-level-row-${levelIdx}`}>{cells}</React.Fragment>;
        })}
      </div>
    </div>
  );
};

export const LeftFacetLabels: React.FC<Pick<FacetLabelsProps, 'spec' | 'plotRowsSpec' | 'baseRows'>> = ({
  spec,
  plotRowsSpec,
  baseRows,
}) => {
  const rowLevels = spec.facetLabels?.rowsLevels || [];
  if (rowLevels.length === 0) return null;
  const yLevelsCount = rowLevels.length;

  return (
    <div
      style={{
        gridColumn: 1,
        gridRow: '1 / span ' + (spec.layout?.rows || 1),
        display: 'grid',
        gridTemplateColumns: `${NAMES_BAND_LEFT_PX}px ${new Array(yLevelsCount).fill(`${VALUES_BAND_LEFT_PX}px`).join(' ')}`,
        gridTemplateRows: plotRowsSpec,
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          gridColumn: 1,
          gridRow: '1 / -1',
          position: 'sticky',
          top: 0,
          bottom: 0,
          margin: 'auto 0',
          height: 'fit-content',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: '12px',
            fontWeight: 600,
            background: 'white',
            padding: '4px 2px',
            margin: 'auto',
          }}
        >
          {rowLevels.map((l: { fieldLabel: string }) => l.fieldLabel).join(' / ')}
        </div>
      </div>
      {rowLevels.map((level: { values: any[] }, levelIdx: number) => {
        const counts = rowLevels.map((l: { values: any[] }) => l.values.length);
        const innerProduct = counts.slice(levelIdx + 1).reduce((a: number, b: number) => a * b, 1) || 1;
        const outerProduct = counts.slice(0, levelIdx).reduce((a: number, b: number) => a * b, 1) || 1;
        const span = baseRows * innerProduct;
        const groupSpan = span * level.values.length;
        const cells: React.ReactNode[] = [];
        for (let r = 0; r < outerProduct; r++) {
          const groupStart = r * groupSpan; // 0-based
          level.values.forEach((val: any, i: number) => {
            const startRow = groupStart + i * span + 1; // 1-based grid row start
            cells.push(
              <div
                key={`yval-level-${levelIdx}-rep-${r}-val-${i}`}
                style={{
                  gridColumn: levelIdx + 2,
                  gridRow: `${startRow} / span ${span}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRight: levelIdx === rowLevels.length - 1 ? '1px solid #99a795' : undefined,
                  borderLeft: levelIdx > 0 ? '1px solid #99a795' : undefined,
                  borderBottom: '1px solid #99a795',
                  background: 'transparent',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    transform: 'rotate(-90deg)',
                    transformOrigin: 'center',
                    whiteSpace: 'nowrap',
                    padding: '2px 0',
                    fontSize: '10px',
                  }}
                >
                  {String(val)}
                </div>
              </div>
            );
          });
        }
        return <React.Fragment key={`yval-level-${levelIdx}`}>{cells}</React.Fragment>;
      })}
    </div>
  );
};
