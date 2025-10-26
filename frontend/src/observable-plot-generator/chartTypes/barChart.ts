import { ChartGenerationContext } from '../types';
import { barUnified } from './barUnified';

// Unified bar chart: single & (future) multi-measure handled via higher-level orchestrators.
// This file now simply selects orientation + fields and delegates to barCore.

export function barChart(context: ChartGenerationContext) {
  // Delegate to unified implementation for consistent layout
  const result = barUnified(context);
  // For back-compat: this API historically returned PlotOptions, so unwrap when single
  if (result.options) return result.options;
  // Fallback (should not happen for single-measure cases)
  // Return first plot options to keep older tests functional
  return result.plots?.[0]?.options as any;
}