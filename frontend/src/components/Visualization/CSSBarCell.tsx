import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QueryResult } from '../../types';

export type CSSBarOrientation = 'barX' | 'barY';

interface CSSBarCellProps {
  data: any[];
  orientation: CSSBarOrientation;
  categories: any[];
  categoryField?: string;
  valueField: string;
  valueDomain: [number, number];
  stepPx: number;
  color?: string;
}

const CSSBarCell: React.FC<CSSBarCellProps> = ({
  data,
  orientation,
  categories,
  categoryField,
  valueField,
  valueDomain,
  stepPx,
  color = 'steelblue'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const el = entries[0]?.contentRect;
      if (el) setSize({ width: el.width, height: el.height });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => {
    const [d0, d1] = valueDomain;
    const isX = orientation === 'barX';
    const span = Math.max(1, isX ? size.width : size.height);
    const a = span / (d1 - d0 || 1);
    const b = -d0 * a;
    const map = (v: number) => a * v + b;
    const zero = map(0);
    return { map, zero };
  }, [valueDomain, size, orientation]);

  const bars = useMemo(() => {
    const catIndex = new Map<any, number>();
    categories.forEach((c, i) => catIndex.set(c, i));
    const grouped = new Map<number, number>();
    data.forEach((row) => {
      const cat = categoryField ? row?.[categoryField] : categories[0];
      const idx = catIndex.has(cat) ? (catIndex.get(cat) as number) : -1;
      if (idx < 0) return;
      const v = row?.[valueField];
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      const prev = grouped.get(idx) ?? 0;
      grouped.set(idx, prev + v);
    });
    return Array.from(grouped.entries());
  }, [data, categories, categoryField, valueField]);

  const gap = Math.max(1, Math.floor(stepPx * 0.2));
  const thickness = Math.max(1, stepPx - gap);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Zero baseline */}
      {orientation === 'barX' ? (
        <div style={{ position: 'absolute', left: `${Math.round(scale.zero)}px`, top: 0, bottom: 0, width: '1px', background: '#999' }} />
      ) : (
        <div style={{ position: 'absolute', top: `${Math.round(size.height - scale.zero)}px`, left: 0, right: 0, height: '1px', background: '#999' }} />
      )}

      {bars.map(([idx, value]) => {
        if (orientation === 'barX') {
          const yTop = idx * stepPx + Math.floor(gap / 2);
          const x0 = Math.min(scale.zero, scale.map(value));
          const x1 = Math.max(scale.zero, scale.map(value));
          const width = Math.max(0, Math.round(x1 - x0));
          return (
            <div key={`b-${idx}`} style={{ position: 'absolute', top: yTop, left: x0, width, height: thickness, background: color, borderRadius: 2 }} />
          );
        } else {
          const xLeft = idx * stepPx + Math.floor(gap / 2);
          const y0 = Math.min(scale.zero, scale.map(value));
          const y1 = Math.max(scale.zero, scale.map(value));
          const height = Math.max(0, Math.round(y1 - y0));
          // Invert Y axis for CSS (top grows downward)
          const top = Math.round(size.height - y1);
          return (
            <div key={`b-${idx}`} style={{ position: 'absolute', left: xLeft, bottom: undefined, top, width: thickness, height, background: color, borderRadius: 2 }} />
          );
        }
      })}
    </div>
  );
};

export default CSSBarCell;


