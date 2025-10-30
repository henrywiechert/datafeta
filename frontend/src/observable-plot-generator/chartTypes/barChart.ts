import { ChartGenerationContext } from '../types';
import { barUnified } from './barUnified';

// Unified bar chart: single & (future) multi-measure handled via higher-level orchestrators.
// This file now simply selects orientation + fields and delegates to barCore.

export function barChart(
  context: ChartGenerationContext,
  labelCfg?: { labelFields: any[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
) {
  // Delegate to unified implementation; return the first plot's options for compatibility
  const result = barUnified(context, labelCfg);
  return result.plots?.[0]?.options as any;
}