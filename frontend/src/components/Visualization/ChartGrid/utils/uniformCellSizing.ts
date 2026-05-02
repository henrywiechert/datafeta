import {
  MIN_CELL_WIDTH_PX,
  MAX_CELL_WIDTH_PX,
  MIN_CELL_HEIGHT_PX,
  MAX_CELL_HEIGHT_PX,
  MIN_FACET_WIDTH_PX,
  MAX_FACET_WIDTH_PX,
  MIN_FACET_HEIGHT_PX,
  MAX_FACET_HEIGHT_PX,
} from '../../../../config/chartLayoutConfig';
import { GridLayoutModel } from '../../../../observable-plot-generator/gridModel';

export interface UniformResizeIntent {
  currentSize: number;
  delta: number;
}

export interface UniformCellSizeConstraints {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface FacetTrackSizeConstraints {
  minSize: number;
  maxSize: number;
}

export function getMinSize(minSizes: number[] | undefined, fallback: number): number {
  if (!minSizes || minSizes.length === 0) return fallback;
  return minSizes[0];
}

export function getUniformCellSizeConstraints(layout: GridLayoutModel | undefined): UniformCellSizeConstraints {
  return {
    minWidth: getMinSize(layout?.minColumnSizes, MIN_CELL_WIDTH_PX),
    maxWidth: MAX_CELL_WIDTH_PX,
    minHeight: getMinSize(layout?.minRowSizes, MIN_CELL_HEIGHT_PX),
    maxHeight: MAX_CELL_HEIGHT_PX,
  };
}

export function clampCellSize(size: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(size)));
}

export function resolveUniformColumnSize(
  intent: UniformResizeIntent,
  constraints: UniformCellSizeConstraints
): number {
  return clampCellSize(intent.currentSize + intent.delta, constraints.minWidth, constraints.maxWidth);
}

export function resolveUniformRowSize(
  intent: UniformResizeIntent,
  constraints: UniformCellSizeConstraints
): number {
  return clampCellSize(intent.currentSize + intent.delta, constraints.minHeight, constraints.maxHeight);
}

export function getFacetColumnSizeConstraints(): FacetTrackSizeConstraints {
  return {
    minSize: MIN_FACET_WIDTH_PX,
    maxSize: MAX_FACET_WIDTH_PX,
  };
}

export function getFacetRowSizeConstraints(): FacetTrackSizeConstraints {
  return {
    minSize: MIN_FACET_HEIGHT_PX,
    maxSize: MAX_FACET_HEIGHT_PX,
  };
}

export function resolveFacetTrackSize(
  intent: UniformResizeIntent,
  constraints: FacetTrackSizeConstraints
): number {
  return clampCellSize(intent.currentSize + intent.delta, constraints.minSize, constraints.maxSize);
}
