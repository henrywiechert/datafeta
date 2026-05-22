// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback } from 'react';
import {
  FacetLabelAlign,
  FacetWrapMode,
} from '../../../../contexts/VisualizationContext/types';
import { updateDepthOverride } from '../utils/facetLabelUtils';

/**
 * Shape of any FacetLabelStyle that exposes per-depth override arrays.
 *
 * `O` lets callers narrow the orientation type (e.g. include `'angled'` for
 * top-values facet styling).
 */
export interface DepthOverrideStyle<O extends string = 'horizontal' | 'vertical'> {
  fontSizeByDepth?: number[];
  orientationByDepth?: O[];
  horizontalAlignByDepth?: FacetLabelAlign[];
  verticalAlignByDepth?: FacetLabelAlign[];
  wrapModeByDepth?: FacetWrapMode[];
}

export interface FacetDepthHandlers<O extends string> {
  onFontSizeChange: (fontSize: number) => void;
  onOrientationChange: (orientation: O) => void;
  onAlignChange: (axis: 'horizontal' | 'vertical', alignment: FacetLabelAlign) => void;
  onWrapModeChange: (wrapMode: FacetWrapMode) => void;
}

/**
 * Build the depth-scoped mutators shared by every facet popover.
 *
 * Each mutator no-ops when no depth is currently active, clamps where
 * appropriate (font size 8-26), and only dispatches when the value actually
 * changes so we don't churn the visualization reducer.
 */
export function useFacetDepthHandlers<S extends DepthOverrideStyle<O>, O extends string = 'horizontal' | 'vertical'>(
  style: S,
  activeDepth: { depthIndex: number } | null,
  onChange: (updates: Partial<S>) => void,
): FacetDepthHandlers<O> {
  const onFontSizeChange = useCallback((fontSize: number) => {
    if (!activeDepth) return;
    const next = updateDepthOverride(
      style.fontSizeByDepth,
      activeDepth.depthIndex,
      Math.max(8, Math.min(26, fontSize)),
    );
    if (next !== style.fontSizeByDepth) {
      onChange({ fontSizeByDepth: next } as Partial<S>);
    }
  }, [activeDepth, onChange, style.fontSizeByDepth]);

  const onOrientationChange = useCallback((orientation: O) => {
    if (!activeDepth) return;
    const next = updateDepthOverride(
      style.orientationByDepth,
      activeDepth.depthIndex,
      orientation,
    );
    if (next !== style.orientationByDepth) {
      onChange({ orientationByDepth: next } as Partial<S>);
    }
  }, [activeDepth, onChange, style.orientationByDepth]);

  const onAlignChange = useCallback((axis: 'horizontal' | 'vertical', alignment: FacetLabelAlign) => {
    if (!activeDepth) return;
    if (axis === 'horizontal') {
      const next = updateDepthOverride(
        style.horizontalAlignByDepth,
        activeDepth.depthIndex,
        alignment,
      );
      if (next !== style.horizontalAlignByDepth) {
        onChange({ horizontalAlignByDepth: next } as Partial<S>);
      }
      return;
    }
    const next = updateDepthOverride(
      style.verticalAlignByDepth,
      activeDepth.depthIndex,
      alignment,
    );
    if (next !== style.verticalAlignByDepth) {
      onChange({ verticalAlignByDepth: next } as Partial<S>);
    }
  }, [activeDepth, onChange, style.horizontalAlignByDepth, style.verticalAlignByDepth]);

  const onWrapModeChange = useCallback((wrapMode: FacetWrapMode) => {
    if (!activeDepth) return;
    const next = updateDepthOverride(
      style.wrapModeByDepth,
      activeDepth.depthIndex,
      wrapMode,
    );
    if (next !== style.wrapModeByDepth) {
      onChange({ wrapModeByDepth: next } as Partial<S>);
    }
  }, [activeDepth, onChange, style.wrapModeByDepth]);

  return { onFontSizeChange, onOrientationChange, onAlignChange, onWrapModeChange };
}
