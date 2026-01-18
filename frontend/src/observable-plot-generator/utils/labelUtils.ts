import * as Plot from '@observablehq/plot';
import { Field } from '../../types';

// ============================================================================
// Generic Label Utilities (chart-agnostic)
// ============================================================================

/**
 * Configuration for label sampling/threshold decisions.
 * Chart-agnostic - just handles data volume concerns.
 */
export interface LabelSamplingConfig {
  data: any[];
  labelsEnabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
  /** Whether this chart type supports sampling in 'auto' mode (scatter, bar, gantt do; line doesn't) */
  supportsSampling?: boolean;
}

const HARD_CAP = 5000;

/**
 * Decide whether labels should render and return sampled data subset if needed.
 * Chart-agnostic - just handles sampling logic.
 */
export function prepareLabelData(cfg: LabelSamplingConfig): { shouldRender: boolean; data: any[] } {
  const total = cfg.data.length;
  if (!cfg.labelsEnabled) return { shouldRender: false, data: [] };
  if (total === 0) return { shouldRender: false, data: [] };

  // Auto suppression above threshold
  if (cfg.samplingStrategy === 'auto' && total > cfg.samplingThreshold) {
    if (cfg.supportsSampling !== false) {
      // Sample to threshold
      const every = Math.max(1, Math.ceil(total / cfg.samplingThreshold));
      const sampled = cfg.data.filter((_, i) => i % every === 0);
      return { shouldRender: true, data: sampled };
    }
    // Chart doesn't support sampling in auto mode - suppress entirely
    return { shouldRender: false, data: [] };
  }
  
  // Hard cap protection
  if (cfg.samplingStrategy === 'all' && total > HARD_CAP) {
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

/**
 * Format a value for display in labels.
 */
export function formatValue(v: any): string {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) return v.toFixed(2);
    return v.toString();
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Build label string from explicit label fields.
 * Used when user has dropped fields onto the label zone.
 */
export function buildLabelStringFromFields(d: any, labelFields: Field[], fallbackColumn?: string): string {
  if (labelFields.length === 0) {
    // No explicit fields - return empty, let chart provide default
    return '';
  }
  
  const parts: string[] = [];
  for (const f of labelFields) {
    if (f.columnName === '__current_measure__' && fallbackColumn) {
      parts.push(formatValue(d[fallbackColumn]));
      continue;
    }
    
    // Attempt multiple key candidates: adapted name + implicit SUM alias + original name
    const candidates: string[] = [];
    candidates.push(f.columnName);
    if ((f as any).originalColumnName) {
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

// ============================================================================
// Generic Label Mark Creation
// ============================================================================

/**
 * Configuration for creating a label mark.
 * Charts provide positioning and text generation; this handles the Plot.text creation.
 */
export interface LabelMarkConfig {
  data: any[];
  /** Function to generate label text for each datum */
  getText: (d: any) => string;
  /** X position - column name or accessor function */
  x: string | ((d: any) => any);
  /** Y position - column name or accessor function */
  y: string | ((d: any) => any);
  /** Vertical offset (negative = up) */
  dy?: number;
  /** Horizontal offset */
  dx?: number;
  /** Text anchor: 'start', 'middle', 'end' */
  textAnchor?: string;
  /** Whether to add white stroke halo for readability */
  withHalo?: boolean;
  /** Font size (default 10) */
  fontSize?: number;
  /** For stacked charts: stack transform to use */
  stackTransform?: 'stackX' | 'stackY';
  /** For stacked charts: column to group by for stacking */
  zColumn?: string;
}

/**
 * Create a Plot.text mark for labels.
 * Chart-agnostic - charts configure positioning and text generation.
 */
export function createLabelMark(cfg: LabelMarkConfig): ReturnType<typeof Plot.text> | null {
  if (cfg.data.length === 0) {
    return null;
  }
  
  // Check if any labels would be generated
  const hasLabels = cfg.data.some(d => cfg.getText(d).length > 0);
  if (!hasLabels) {
    return null;
  }
  
  const base: any = {
    text: cfg.getText,
    fontSize: cfg.fontSize ?? 10,
    lineHeight: 1.1,
    fill: 'black',
    textAnchor: cfg.textAnchor ?? 'middle',
    pointerEvents: 'none',
  };
  
  if (cfg.dy !== undefined) base.dy = cfg.dy;
  if (cfg.dx !== undefined) base.dx = cfg.dx;
  
  if (cfg.withHalo !== false) {
    base.stroke = 'white';
    base.strokeWidth = 3;
  }
  
  // Handle stacked charts (use Plot.textX/textY with stack transform)
  if (cfg.stackTransform && cfg.zColumn) {
    base.x = cfg.x;
    base.y = cfg.y;
    base.z = cfg.zColumn;
    
    if (cfg.stackTransform === 'stackY') {
      return Plot.textY(cfg.data, Plot.stackY(base));
    } else {
      return Plot.textX(cfg.data, Plot.stackX(base));
    }
  }
  
  // Regular (non-stacked) labels
  base.x = cfg.x;
  base.y = cfg.y;
  
  return Plot.text(cfg.data, base);
}

// ============================================================================
// Legacy Interface (for backward compatibility during migration)
// ============================================================================

/**
 * @deprecated Use LabelSamplingConfig + chart-specific label builders instead.
 * Kept for backward compatibility with existing chart implementations.
 */
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
  orientation?: 'vertical' | 'horizontal';
  colorColumn?: string;
  isStacked?: boolean;
  durationColumn?: string;
}

/**
 * @deprecated Use buildLabelStringFromFields + chart-specific defaults instead.
 */
export function buildLabelString(d: any, cfg: LabelRenderConfig): string {
  // First try explicit label fields
  const fromFields = buildLabelStringFromFields(d, cfg.labelFields, cfg.yColumn);
  if (fromFields.length > 0) {
    return fromFields;
  }
  
  // Chart-specific defaults (legacy - charts should handle this themselves)
  if (cfg.chartType === 'scatter') {
    return `${formatValue(d[cfg.xColumn])}\n${formatValue(d[cfg.yColumn])}`;
  }
  if (cfg.chartType === 'bar') {
    if (cfg.orientation === 'horizontal') {
      return `${formatValue(d[cfg.xColumn])}`;
    }
    return `${formatValue(d[cfg.yColumn])}`;
  }
  if (cfg.chartType === 'gantt') {
    if (cfg.durationColumn && d[cfg.durationColumn] !== undefined) {
      return `${formatValue(d[cfg.durationColumn])}`;
    }
    return '';
  }
  // line & verticalLine default: y value
  return `${formatValue(d[cfg.yColumn])}`;
}

/**
 * @deprecated Charts should use createLabelMark with their own config.
 * Kept for backward compatibility.
 */
export function createLegacyLabelMark(
  prepared: { shouldRender: boolean; data: any[] }, 
  cfg: LabelRenderConfig, 
  xCol: string, 
  yCol: string
) {
  if (!prepared.shouldRender || prepared.data.length === 0) {
    return null;
  }
  
  // Check if any labels would render
  const hasLabels = prepared.data.some(d => buildLabelString(d, cfg).length > 0);
  if (!hasLabels) {
    return null;
  }
  
  // For stacked bars
  if (cfg.chartType === 'bar' && cfg.isStacked && cfg.colorColumn) {
    return createLabelMark({
      data: prepared.data,
      getText: (d) => buildLabelString(d, cfg),
      x: xCol,
      y: yCol,
      stackTransform: cfg.orientation === 'vertical' ? 'stackY' : 'stackX',
      zColumn: cfg.colorColumn,
    });
  }
  
  // For gantt charts
  if (cfg.chartType === 'gantt') {
    const isHorizontal = cfg.orientation === 'horizontal';
    return createLabelMark({
      data: prepared.data,
      getText: (d) => buildLabelString(d, cfg),
      x: isHorizontal && cfg.durationColumn
        ? (d: any) => {
            const start = d[xCol];
            const duration = d[cfg.durationColumn!];
            return typeof start === 'number' && typeof duration === 'number' 
              ? start + duration / 2 
              : start;
          }
        : xCol,
      y: !isHorizontal && cfg.durationColumn
        ? (d: any) => {
            const start = d[yCol];
            const duration = d[cfg.durationColumn!];
            return typeof start === 'number' && typeof duration === 'number'
              ? start + duration / 2
              : start;
          }
        : yCol,
    });
  }
  
  // Regular labels (scatter, line, bar)
  const isScatter = cfg.chartType === 'scatter';
  return createLabelMark({
    data: prepared.data,
    getText: (d) => buildLabelString(d, cfg),
    x: xCol,
    y: yCol,
    dy: isScatter ? -12 : -6,
    withHalo: !isScatter,
  });
}
