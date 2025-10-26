import { ChartGenerationContext } from '../types';
import { barUnified } from './barUnified';

// Unified bar chart: single & (future) multi-measure handled via higher-level orchestrators.
// This file now simply selects orientation + fields and delegates to barCore.

export function barChart(context: ChartGenerationContext) {
  // Delegate to unified implementation; return the first plot's options for compatibility
  const result = barUnified(context);
  return result.plots?.[0]?.options as any;
}