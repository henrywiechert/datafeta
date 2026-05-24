// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useState } from 'react';
import {
  FacetHeaderLabelStyle,
  FacetLabelAlign,
} from '../../../../contexts/VisualizationContext/types';
import { resolveDepthValue } from '../utils/facetLabelUtils';

interface ActiveDepthState {
  depthIndex: number;
  label: string;
}

interface HeaderStyleStateOptions {
  defaultOrientation: 'horizontal' | 'vertical';
  defaultHorizontalAlign: FacetLabelAlign;
  defaultVerticalAlign: FacetLabelAlign;
  useDepthOverrides?: boolean;
}

export function useHeaderStyleState(
  style: FacetHeaderLabelStyle,
  options: HeaderStyleStateOptions,
) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [activeDepth, setActiveDepth] = useState<ActiveDepthState | null>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>, depthIndex: number, label: string) => {
    setAnchorEl(e.currentTarget);
    setActiveDepth({ depthIndex, label });
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    setActiveDepth(null);
  }, []);

  const activeDepthIndex = activeDepth?.depthIndex ?? 0;
  const useDepthOverrides = options.useDepthOverrides ?? true;
  const activeFontSize = resolveDepthValue(
    useDepthOverrides ? style.fontSizeByDepth : undefined,
    style.fontSize,
    activeDepthIndex,
    style.fontSize,
  );
  const activeOrientation = resolveDepthValue(
    useDepthOverrides ? style.orientationByDepth : undefined,
    style.orientation,
    activeDepthIndex,
    options.defaultOrientation,
  );
  const activeHorizontalAlign = resolveDepthValue(
    useDepthOverrides ? style.horizontalAlignByDepth : undefined,
    style.horizontalAlign,
    activeDepthIndex,
    options.defaultHorizontalAlign,
  );
  const activeVerticalAlign = resolveDepthValue(
    useDepthOverrides ? style.verticalAlignByDepth : undefined,
    style.verticalAlign,
    activeDepthIndex,
    options.defaultVerticalAlign,
  );

  return {
    anchorEl,
    activeDepth,
    activeDepthIndex,
    activeFontSize,
    activeOrientation,
    activeHorizontalAlign,
    activeVerticalAlign,
    handleClick,
    handleClose,
  };
}
