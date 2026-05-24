// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { formatDateTick } from '../../../../observable-plot-generator/utils/dateFormatUtils';
import { FacetLabelAlign, FacetLabelStyles } from '../../../../contexts/VisualizationContext/types';
import { UserChartType } from '../../../../types';

/**
 * Format a facet label value. Uses ISO-style format for Dates, otherwise String().
 */
export function formatFacetValue(val: any): string {
  if (val instanceof Date) {
    return formatDateTick(val);
  }
  return String(val);
}

export function formatFacetAxisTitle(levels: Array<{ fieldLabel: string }> | undefined): string {
  return (levels || [])
    .map((level) => level.fieldLabel)
    .filter((label) => label && label.length > 0)
    .join(' | ');
}

/**
 * Fallback span computation used when ordered tuples are absent.
 * Assumes the full Cartesian product of level values is present.
 */
export function computeProductSegments(
  levels: Array<{ values: any[] }>,
  levelIdx: number,
  baseSpan: number,
): Array<{ value: any; startIndex: number; span: number; firstTupleIndex: number }> {
  const counts = levels.map((l) => l.values.length);
  const innerProduct = counts.slice(levelIdx + 1).reduce((a, b) => a * b, 1) || 1;
  const outerProduct = counts.slice(0, levelIdx).reduce((a, b) => a * b, 1) || 1;
  const span = baseSpan * innerProduct;
  const groupSpan = span * levels[levelIdx].values.length;
  const segments: Array<{ value: any; startIndex: number; span: number; firstTupleIndex: number }> = [];
  for (let r = 0; r < outerProduct; r++) {
    const groupStart = r * groupSpan;
    levels[levelIdx].values.forEach((val, i) => {
      const startTrack = 1 + groupStart + i * span;
      const firstTupleIndex = (groupStart + i * span) / Math.max(1, baseSpan);
      segments.push({ value: val, startIndex: startTrack, span, firstTupleIndex });
    });
  }
  return segments;
}

/**
 * Get CSS properties for text orientation.
 */
export function getOrientationStyles(
  orientation: 'horizontal' | 'vertical' | 'angled',
  fontSize: number,
): React.CSSProperties {
  switch (orientation) {
    case 'vertical':
      return {
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontSize: `${fontSize}px`,
      };
    case 'angled':
      return {
        transform: 'rotate(-45deg)',
        transformOrigin: 'center',
        fontSize: `${fontSize}px`,
      };
    case 'horizontal':
    default:
      return {
        fontSize: `${fontSize}px`,
      };
  }
}

export function resolveDepthValue<T>(
  byDepth: readonly T[] | undefined,
  shared: T | undefined,
  depthIndex: number,
  fallback: T,
): T {
  return byDepth?.[depthIndex] ?? shared ?? fallback;
}

export function resolveFlexAlignment(alignment: FacetLabelAlign): React.CSSProperties['justifyContent'] {
  switch (alignment) {
    case 'start':
      return 'flex-start';
    case 'end':
      return 'flex-end';
    case 'center':
    default:
      return 'center';
  }
}

export function resolveTextAlignment(alignment: FacetLabelAlign): React.CSSProperties['textAlign'] {
  switch (alignment) {
    case 'start':
      return 'left';
    case 'end':
      return 'right';
    case 'center':
    default:
      return 'center';
  }
}

export function updateDepthOverride<T>(
  values: T[] | undefined,
  depthIndex: number,
  nextValue: T,
): T[] {
  const currentValues = values ?? [];
  if (currentValues[depthIndex] === nextValue) return currentValues;

  const nextValues = [...currentValues];
  nextValues[depthIndex] = nextValue;
  return nextValues;
}

function shouldUseTableHorizontalFacetValues(style: FacetLabelStyles['leftValues']): boolean {
  return style.orientation === 'vertical' && (style.orientationByDepth?.length ?? 0) === 0;
}

export function getEffectiveFacetLabelStyles(
  facetLabelStyles: FacetLabelStyles,
  globalChartType: UserChartType | null | undefined,
): FacetLabelStyles {
  if (globalChartType !== 'table-refactor' || !shouldUseTableHorizontalFacetValues(facetLabelStyles.leftValues)) {
    return facetLabelStyles;
  }

  return {
    ...facetLabelStyles,
    leftValues: {
      ...facetLabelStyles.leftValues,
      orientation: 'horizontal',
    },
  };
}
