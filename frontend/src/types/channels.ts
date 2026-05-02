/**
 * Visual encoding channels
 *
 * Groups the per-channel state fields that flow from VisualizationState through
 * the propagation pipeline (ChartArea → useChartGeneration / useQueryExecution).
 *
 * The flat VisualizationState and its reducer are intentionally unchanged.
 * Use useChannels() to assemble this object from state in one place.
 */

import { Field } from './field';

export interface ColorChannel {
  field: Field | null;
  scheme: string;
  bias: number;
  manual: string;
}

export interface SizeChannel {
  field: Field | null;
  range: [number, number];
  manual: number;
  bandThicknessScale: number;
}

export interface ShapeChannel {
  field: Field | null;
  manual: string;
}

export interface LabelChannel {
  fields: Field[];
  enabled: boolean;
  samplingStrategy: 'auto' | 'all' | 'sample';
  samplingThreshold: number;
  sampleEvery: number;
  fontSize: number;
}

export interface TooltipChannel {
  fields: Field[];
}

export interface FacetBackgroundChannel {
  field: Field | null;
  scheme: string;
  opacity: number;
}

export interface Channels {
  color: ColorChannel;
  size: SizeChannel;
  shape: ShapeChannel;
  label: LabelChannel;
  tooltip: TooltipChannel;
  facetBackground: FacetBackgroundChannel;
}
