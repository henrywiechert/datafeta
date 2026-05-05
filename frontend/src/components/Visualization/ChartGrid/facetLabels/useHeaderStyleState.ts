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
  const activeFontSize = resolveDepthValue(
    style.fontSizeByDepth,
    style.fontSize,
    activeDepthIndex,
    style.fontSize,
  );
  const activeOrientation = resolveDepthValue(
    style.orientationByDepth,
    style.orientation,
    activeDepthIndex,
    options.defaultOrientation,
  );
  const activeHorizontalAlign = resolveDepthValue(
    style.horizontalAlignByDepth,
    style.horizontalAlign,
    activeDepthIndex,
    options.defaultHorizontalAlign,
  );
  const activeVerticalAlign = resolveDepthValue(
    style.verticalAlignByDepth,
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
