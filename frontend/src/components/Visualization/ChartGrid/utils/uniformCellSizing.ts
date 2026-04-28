import {
  MIN_CELL_WIDTH_PX,
  MAX_CELL_WIDTH_PX,
  MIN_CELL_HEIGHT_PX,
  MAX_CELL_HEIGHT_PX,
} from '../../../../config/chartLayoutConfig';
import { GridLayoutModel } from '../gridModel';

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
