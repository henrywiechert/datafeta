import React, { useCallback, useState } from 'react';
import {
  FacetLabelAlign,
  FacetWrapMode,
} from '../../../../contexts/VisualizationContext/types';
import { resolveDepthValue } from '../utils/facetLabelUtils';

interface ActiveDepthState {
  depthIndex: number;
  label: string;
}

interface ValuesStyleConfig<TOrientation extends string> {
  orientation: TOrientation;
  orientationByDepth?: readonly TOrientation[];
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  horizontalAlignByDepth?: readonly FacetLabelAlign[];
  verticalAlignByDepth?: readonly FacetLabelAlign[];
  wrapMode?: FacetWrapMode;
  wrapModeByDepth?: readonly FacetWrapMode[];
}

interface ValuesStyleStateOptions<TOrientation extends string> {
  defaultOrientation: TOrientation;
  defaultHorizontalAlign: FacetLabelAlign;
  defaultVerticalAlign: FacetLabelAlign;
  defaultWrapMode?: FacetWrapMode;
}

export function useValuesStyleState<TOrientation extends string>(
  style: ValuesStyleConfig<TOrientation>,
  options: ValuesStyleStateOptions<TOrientation>,
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
  const activeWrapMode = options.defaultWrapMode
    ? resolveDepthValue(
        style.wrapModeByDepth,
        style.wrapMode,
        activeDepthIndex,
        options.defaultWrapMode,
      )
    : undefined;

  return {
    anchorEl,
    activeDepth,
    activeDepthIndex,
    activeOrientation,
    activeHorizontalAlign,
    activeVerticalAlign,
    activeWrapMode,
    handleClick,
    handleClose,
  };
}
