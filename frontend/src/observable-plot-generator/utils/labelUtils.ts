import * as Plot from '@observablehq/plot';
import { Field } from '../../types';

export interface LabelRenderConfig {
  data: any[];
  xColumn: string;
  yColumn: string;
  labelFields: Field[];
  labelsEnabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
  chartType: 'scatter' | 'line' | 'verticalLine' | 'bar' | 'gantt';
  orientation?: 'vertical' | 'horizontal'; // for bar and gantt charts
  colorColumn?: string; // for stacked bar labels
  isStacked?: boolean; // whether bars are stacked (no category but has color)
  durationColumn?: string; // for gantt charts - the duration/size value
}

const HARD_CAP = 5000;

/**
 * Decide whether labels should render and return sampled data subset if needed.
 */
export function prepareLabelData(cfg: LabelRenderConfig): { shouldRender: boolean; data: any[] } {
  const total = cfg.data.length;
  if (!cfg.labelsEnabled) return { shouldRender: false, data: [] };
  if (total === 0) return { shouldRender: false, data: [] };

  // Auto suppression above threshold, with sampling for scatter, bar, and gantt charts
  if (cfg.samplingStrategy === 'auto' && total > cfg.samplingThreshold) {
    if (cfg.chartType === 'scatter') {
      const every = Math.max(1, Math.ceil(total / cfg.samplingThreshold));
      const sampled = cfg.data.filter((_, i) => i % every === 0);
      return { shouldRender: true, data: sampled };
    }
    // For bar and gantt charts, sample labels when there are too many items
    if (cfg.chartType === 'bar' || cfg.chartType === 'gantt') {
      const every = Math.max(1, Math.ceil(total / cfg.samplingThreshold));
      const sampled = cfg.data.filter((_, i) => i % every === 0);
      return { shouldRender: true, data: sampled };
    }
    return { shouldRender: false, data: [] };
  }
  // Hard cap protection
  if (cfg.samplingStrategy === 'all' && total > HARD_CAP) {
    // Force sampling every computed interval
    const every = Math.ceil(total / cfg.samplingThreshold);
    const sampled = cfg.data.filter((_, i) => i % every === 0);
    return { shouldRender: true, data: sampled };
  }
  if (cfg.samplingStrategy === 'sample') {
    const every = Math.max(1, cfg.sampleEvery);
    const sampled = cfg.data.filter((_, i) => i % every === 0);
    return { shouldRender: true, data: sampled };
  }
  return { shouldRender: true, data: cfg.data };
}

/** Build label string for a datum based on fields or defaults */
export function buildLabelString(d: any, cfg: LabelRenderConfig): string {
  if (cfg.labelFields.length === 0) {
    // Defaults
    if (cfg.chartType === 'scatter') {
      return `${formatValue(d[cfg.xColumn])}\n${formatValue(d[cfg.yColumn])}`;
    }
    if (cfg.chartType === 'bar') {
      // vertical bar: measure on y; horizontal bar: measure on x
      if (cfg.orientation === 'horizontal') {
        return `${formatValue(d[cfg.xColumn])}`;
      }
      return `${formatValue(d[cfg.yColumn])}`;
    }
    if (cfg.chartType === 'gantt') {
      // Gantt charts default to showing duration (size field value)
      if (cfg.durationColumn && d[cfg.durationColumn] !== undefined) {
        return `${formatValue(d[cfg.durationColumn])}`;
      }
      // Fallback: no duration to show
      return '';
    }
    // line & verticalLine default: y value
    return `${formatValue(d[cfg.yColumn])}`;
  }
  const parts: string[] = [];
  for (const f of cfg.labelFields) {
    if (f.columnName === '__current_measure__') {
      parts.push(formatValue(d[cfg.yColumn]));
      continue;
    }
    // Attempt multiple key candidates: adapted name + implicit SUM alias + original name
    const candidates: string[] = [];
    candidates.push(f.columnName);
    if ((f as any).originalColumnName) {
      // Add implicit SUM variant first (backend may or may not include both)
      candidates.push(`SUM(${(f as any).originalColumnName})`);
      candidates.push((f as any).originalColumnName);
    }
    let found: any = undefined;
    for (const key of candidates) {
      if (key in d) {
        const value = d[key];
        if (value !== null && value !== undefined && value !== '') {
          found = value;
          break;
        }
      }
    }
    if (found === undefined) continue;
    parts.push(formatValue(found));
  }
  if (parts.length === 0) return '';
  return parts.join('\n');
}

function formatValue(v: any): string {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) return v.toFixed(2);
    return v.toString();
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Create Plot.text mark for labels */
export function createLabelMark(prepared: { shouldRender: boolean; data: any[] }, cfg: LabelRenderConfig, xCol: string, yCol: string) {
  if (!prepared.shouldRender) {
    return null;
  }
  if (prepared.data.length === 0) {
    return null;
  }
  const textValues = prepared.data.map(d => buildLabelString(d, cfg)).filter(s => s.length > 0);
  if (textValues.length === 0) {
    return null;
  }
  
  // For stacked bars (no category but has color), use Plot.stackY or Plot.stackX
  // This positions labels in the middle of each stacked segment
  if (cfg.chartType === 'bar' && cfg.isStacked && cfg.colorColumn) {
    const base: any = {
      text: (d: any) => buildLabelString(d, cfg),
      z: cfg.colorColumn, // Group by color for stacking
      fontSize: 10,
      lineHeight: 1.1,
      fill: 'black',
      textAnchor: 'middle',
      pointerEvents: 'none',
      stroke: 'white',
      strokeWidth: 3,
    };
    
    if (cfg.orientation === 'vertical') {
      // Vertical stacked bar: use Plot.textY with Plot.stackY transform
      return Plot.textY(prepared.data, Plot.stackY({
        ...base,
        x: xCol,
        y: yCol,
      }));
    } else {
      // Horizontal stacked bar: use Plot.textX with Plot.stackX transform
      return Plot.textX(prepared.data, Plot.stackX({
        ...base,
        x: xCol,
        y: yCol,
      }));
    }
  }
  
  // Gantt chart labels - positioned in the middle of each bar
  if (cfg.chartType === 'gantt') {
    const base: any = {
      text: (d: any) => buildLabelString(d, cfg),
      fontSize: 10,
      lineHeight: 1.1,
      fill: 'black',
      textAnchor: 'middle',
      pointerEvents: 'none',
      stroke: 'white',
      strokeWidth: 3,
    };
    
    if (cfg.orientation === 'horizontal') {
      // Horizontal Gantt: x is timeline (start column), y is category
      // Position label at midpoint of bar (x1 + x2) / 2
      base.x = xCol; // Will be overridden by accessor
      base.y = yCol;
      // Compute midpoint of bar for x position
      if (cfg.durationColumn) {
        base.x = (d: any) => {
          const start = d[xCol];
          const duration = d[cfg.durationColumn!];
          if (typeof start === 'number' && typeof duration === 'number') {
            return start + duration / 2;
          }
          return start;
        };
      }
    } else {
      // Vertical Gantt: y is timeline (start column), x is category
      base.x = xCol;
      base.y = yCol; // Will be overridden by accessor
      if (cfg.durationColumn) {
        base.y = (d: any) => {
          const start = d[yCol];
          const duration = d[cfg.durationColumn!];
          if (typeof start === 'number' && typeof duration === 'number') {
            return start + duration / 2;
          }
          return start;
        };
      }
    }
    
    return Plot.text(prepared.data, base);
  }
  
  // Regular (non-stacked) labels
  const isScatter = cfg.chartType === 'scatter';
  // For scatter: push labels further up so they don't cover dot; remove halo stroke; disable pointer events
  // For line: keep small halo for legibility
  const base: any = {
    x: xCol,
    y: yCol,
    text: (d: any) => buildLabelString(d, cfg),
    dy: isScatter ? -12 : -6,
    fontSize: 10,
    lineHeight: 1.1,
    fill: 'black',
    textAnchor: 'middle',
    // Prevent text capturing hover when above dots/bars
    pointerEvents: 'none'
  };
  if (!isScatter) {
    base.stroke = 'white';
    base.strokeWidth = 3;
  }
  return Plot.text(prepared.data, base);
}
