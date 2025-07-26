import { ChartContext, VegaSpec } from '../types';

export interface VegaChartStrategy {
  type: string;
  canHandle: (context: ChartContext) => boolean;
  generateSpec: (context: ChartContext) => VegaSpec;
} 