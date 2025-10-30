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
  chartType: 'scatter' | 'line' | 'verticalLine' | 'bar';
  orientation?: 'vertical' | 'horizontal'; // for bar charts
}

export const HARD_CAP = 5000;

/**
 * Decide whether labels should render and return sampled data subset if needed.
 */
export function prepareLabelData(cfg: LabelRenderConfig): { shouldRender: boolean; data: any[] } {
  const total = cfg.data.length;
  if (!cfg.labelsEnabled) return { shouldRender: false, data: [] };
  if (total === 0) return { shouldRender: false, data: [] };

  // Auto suppression above threshold
  if (cfg.samplingStrategy === 'auto' && total > cfg.samplingThreshold) {
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
    // line & verticalLine default: y value
    return `${formatValue(d[cfg.yColumn])}`;
  }
  const parts: string[] = [];
  for (const f of cfg.labelFields) {
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
  if (!prepared.shouldRender) return null;
  const textValues = prepared.data.map(d => buildLabelString(d, cfg)).filter(s => s.length > 0);
  if (textValues.length === 0) return null;
  const isScatter = cfg.chartType === 'scatter';
  const isLine = cfg.chartType === 'line' || cfg.chartType === 'verticalLine';
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
