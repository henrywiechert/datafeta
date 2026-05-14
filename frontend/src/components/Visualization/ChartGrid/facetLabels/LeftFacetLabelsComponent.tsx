// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import { GRID_DIVIDER_COLOR } from '../../../../config/chartLayoutConfig';
import { buildHierarchicalHeaderSegments } from '../utils/hierarchicalHeaderUtils';
import { renderWithBreaks } from '../utils/labelUtils';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import {
  FacetHeaderLabelStyle,
  FacetLabelAlign,
  FacetLeftValuesLabelStyle,
  FacetWrapMode,
} from '../../../../contexts/VisualizationContext/types';
import FacetStylePopover from './FacetStylePopover';
import { useHeaderStyleState } from './useHeaderStyleState';
import { useValuesStyleState } from './useValuesStyleState';
import {
  computeProductSegments,
  formatFacetValue,
  getOrientationStyles,
  getEffectiveFacetLabelStyles,
  resolveDepthValue,
  resolveFlexAlignment,
  resolveTextAlignment,
  updateDepthOverride,
} from '../utils/facetLabelUtils';

interface LeftFacetLabelsProps {
  grid: GridResultModel;
  plotRowsSpec: string;
  baseRows: number;
  facetLeftHeaderPx: number;
  facetLeftValueWidthsPx: number[];
}

const LeftFacetLabelsComponent: React.FC<LeftFacetLabelsProps> = ({
  grid,
  plotRowsSpec,
  baseRows,
  facetLeftHeaderPx,
  facetLeftValueWidthsPx,
}) => {
  const { state, dispatch } = useVisualizationContext();
  const effectiveFacetLabelStyles = getEffectiveFacetLabelStyles(state.facetLabelStyles, state.globalChartType);

  const handleHeaderStyleChange = useCallback((updates: Partial<FacetHeaderLabelStyle & { widthPx: number | null }>) => {
    dispatch({ type: 'SET_FACET_LEFT_HEADER_STYLE', payload: updates });
  }, [dispatch]);

  const handleValuesStyleChange = useCallback((updates: Partial<FacetLeftValuesLabelStyle>) => {
    dispatch({ type: 'SET_FACET_LEFT_VALUES_STYLE', payload: updates });
  }, [dispatch]);

  const headerStyle = effectiveFacetLabelStyles?.leftHeader ?? state.facetLabelStyles.leftHeader;
  const valuesStyle = effectiveFacetLabelStyles?.leftValues ?? state.facetLabelStyles.leftValues;
  const {
    anchorEl: headerAnchor,
    activeDepth: activeHeaderDepth,
    activeFontSize: activeHeaderFontSize,
    activeOrientation: activeHeaderOrientation,
    activeHorizontalAlign: activeHeaderHorizontalAlign,
    activeVerticalAlign: activeHeaderVerticalAlign,
    handleClick: handleHeaderClick,
    handleClose: handleHeaderClose,
  } = useHeaderStyleState(headerStyle, {
    defaultOrientation: 'vertical',
    defaultHorizontalAlign: 'center',
    defaultVerticalAlign: 'center',
  });
  const {
    anchorEl: valuesAnchor,
    activeDepth: activeValuesDepth,
    activeOrientation: activeValuesOrientation,
    activeHorizontalAlign: activeValuesHorizontalAlign,
    activeVerticalAlign: activeValuesVerticalAlign,
    activeWrapMode: activeValuesWrapMode,
    handleClick: handleValuesClick,
    handleClose: handleValuesClose,
  } = useValuesStyleState(valuesStyle, {
    defaultOrientation: 'vertical',
    defaultHorizontalAlign: 'start',
    defaultVerticalAlign: 'center',
    defaultWrapMode: 'wrap',
  });

  const handleHeaderDepthAlignChange = useCallback((axis: 'horizontal' | 'vertical', alignment: FacetLabelAlign) => {
    if (!activeHeaderDepth) return;

    if (axis === 'horizontal') {
      const nextValues = updateDepthOverride(
        headerStyle.horizontalAlignByDepth,
        activeHeaderDepth.depthIndex,
        alignment,
      );
      if (nextValues !== headerStyle.horizontalAlignByDepth) {
        handleHeaderStyleChange({ horizontalAlignByDepth: nextValues });
      }
      return;
    }

    const nextValues = updateDepthOverride(
      headerStyle.verticalAlignByDepth,
      activeHeaderDepth.depthIndex,
      alignment,
    );
    if (nextValues !== headerStyle.verticalAlignByDepth) {
      handleHeaderStyleChange({ verticalAlignByDepth: nextValues });
    }
  }, [activeHeaderDepth, handleHeaderStyleChange, headerStyle.horizontalAlignByDepth, headerStyle.verticalAlignByDepth]);

  const handleHeaderDepthOrientationChange = useCallback((orientation: 'horizontal' | 'vertical') => {
    if (!activeHeaderDepth) return;

    const nextValues = updateDepthOverride(
      headerStyle.orientationByDepth,
      activeHeaderDepth.depthIndex,
      orientation,
    );
    if (nextValues !== headerStyle.orientationByDepth) {
      handleHeaderStyleChange({ orientationByDepth: nextValues });
    }
  }, [activeHeaderDepth, handleHeaderStyleChange, headerStyle.orientationByDepth]);

  const handleHeaderDepthFontSizeChange = useCallback((fontSize: number) => {
    if (!activeHeaderDepth) return;

    const nextValues = updateDepthOverride(
      headerStyle.fontSizeByDepth,
      activeHeaderDepth.depthIndex,
      Math.max(8, Math.min(26, fontSize)),
    );
    if (nextValues !== headerStyle.fontSizeByDepth) {
      handleHeaderStyleChange({ fontSizeByDepth: nextValues });
    }
  }, [activeHeaderDepth, handleHeaderStyleChange, headerStyle.fontSizeByDepth]);

  const handleValuesDepthAlignChange = useCallback((axis: 'horizontal' | 'vertical', alignment: FacetLabelAlign) => {
    if (!activeValuesDepth) return;

    if (axis === 'horizontal') {
      const nextValues = updateDepthOverride(
        valuesStyle.horizontalAlignByDepth,
        activeValuesDepth.depthIndex,
        alignment,
      );
      if (nextValues !== valuesStyle.horizontalAlignByDepth) {
        handleValuesStyleChange({ horizontalAlignByDepth: nextValues });
      }
      return;
    }

    const nextValues = updateDepthOverride(
      valuesStyle.verticalAlignByDepth,
      activeValuesDepth.depthIndex,
      alignment,
    );
    if (nextValues !== valuesStyle.verticalAlignByDepth) {
      handleValuesStyleChange({ verticalAlignByDepth: nextValues });
    }
  }, [activeValuesDepth, handleValuesStyleChange, valuesStyle.horizontalAlignByDepth, valuesStyle.verticalAlignByDepth]);

  const handleValuesDepthOrientationChange = useCallback((orientation: 'horizontal' | 'vertical') => {
    if (!activeValuesDepth) return;

    const nextValues = updateDepthOverride(
      valuesStyle.orientationByDepth,
      activeValuesDepth.depthIndex,
      orientation,
    );
    if (nextValues !== valuesStyle.orientationByDepth) {
      handleValuesStyleChange({ orientationByDepth: nextValues });
    }
  }, [activeValuesDepth, handleValuesStyleChange, valuesStyle.orientationByDepth]);

  const handleValuesDepthWrapModeChange = useCallback((wrapMode: FacetWrapMode) => {
    if (!activeValuesDepth) return;

    const nextValues = updateDepthOverride(
      valuesStyle.wrapModeByDepth,
      activeValuesDepth.depthIndex,
      wrapMode,
    );
    if (nextValues !== valuesStyle.wrapModeByDepth) {
      handleValuesStyleChange({ wrapModeByDepth: nextValues });
    }
  }, [activeValuesDepth, handleValuesStyleChange, valuesStyle.wrapModeByDepth]);

  const rowLevels = grid.headers?.rows?.levels || [];

  if (rowLevels.length === 0) return null;

  const fieldLabels = rowLevels.map((l) => l.fieldLabel);

  return (
    <div
      style={{
        gridColumn: 1,
        gridRow: '1 / span ' + (grid.layout?.rows || 1),
        display: 'grid',
        gridTemplateColumns: `${facetLeftHeaderPx}px ${facetLeftValueWidthsPx.map((width) => `${width}px`).join(' ')}`,
        gridTemplateRows: plotRowsSpec,
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          gridColumn: 1,
          gridRow: '1 / -1',
          position: 'sticky',
          top: 0,
          bottom: 0,
          margin: 'auto 0',
          height: 'fit-content',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          zIndex: 2,
        }}
      >
        {fieldLabels.map((label, idx) => {
          const fontSize = resolveDepthValue(
            headerStyle.fontSizeByDepth,
            headerStyle.fontSize,
            idx,
            headerStyle.fontSize,
          );
          const horizontalAlign = resolveDepthValue(
            headerStyle.horizontalAlignByDepth,
            headerStyle.horizontalAlign,
            idx,
            'center',
          );
          const verticalAlign = resolveDepthValue(
            headerStyle.verticalAlignByDepth,
            headerStyle.verticalAlign,
            idx,
            'center',
          );
          const orientation = resolveDepthValue(
            headerStyle.orientationByDepth,
            headerStyle.orientation,
            idx,
            'vertical',
          );
          const headerOrientationStyles = getOrientationStyles(orientation, fontSize);

          return (
            <div
              key={`header-${idx}`}
              onClick={(event) => handleHeaderClick(event, idx, label)}
              title={`Click to edit style: ${label}`}
              style={{
                display: 'flex',
                width: '100%',
                fontWeight: 600,
                background: 'white',
                padding: '4px 2px',
                cursor: 'pointer',
                justifyContent: resolveFlexAlignment(horizontalAlign),
                alignItems: resolveFlexAlignment(verticalAlign),
                textAlign: resolveTextAlignment(horizontalAlign),
                ...headerOrientationStyles,
              }}
            >
              {renderWithBreaks(label)}
            </div>
          );
        })}
      </div>

      {rowLevels.map((level, levelIdx) => {
        const horizontalAlign = resolveDepthValue(
          valuesStyle.horizontalAlignByDepth,
          valuesStyle.horizontalAlign,
          levelIdx,
          'start',
        );
        const verticalAlign = resolveDepthValue(
          valuesStyle.verticalAlignByDepth,
          valuesStyle.verticalAlign,
          levelIdx,
          'center',
        );
        const wrapMode = resolveDepthValue(
          valuesStyle.wrapModeByDepth,
          valuesStyle.wrapMode,
          levelIdx,
          'wrap',
        );
        const orientation = resolveDepthValue(
          valuesStyle.orientationByDepth,
          valuesStyle.orientation,
          levelIdx,
          'vertical',
        );
        const shouldWrap = wrapMode === 'wrap';
        const isVerticalOrientation = orientation === 'vertical';
        const valuesOrientationStyles = getOrientationStyles(orientation, valuesStyle.fontSize);
        const orderedTuples = grid.headers?.rows?.orderedValueTuples;
        const segments = orderedTuples && orderedTuples.length > 0
          ? buildHierarchicalHeaderSegments(orderedTuples, levelIdx, baseRows, 1)
          : computeProductSegments(rowLevels, levelIdx, baseRows);
        const cells = segments.map((seg) => (
          <div
            key={`yval-level-${levelIdx}-tuple-${seg.firstTupleIndex}`}
            onClick={(event) => handleValuesClick(event, levelIdx, formatFacetValue(seg.value))}
            title={formatFacetValue(seg.value)}
            style={{
              gridColumn: levelIdx + 2,
              gridRow: `${seg.startIndex} / span ${seg.span}`,
              display: 'flex',
              alignItems: resolveFlexAlignment(verticalAlign),
              justifyContent: resolveFlexAlignment(horizontalAlign),
              borderRight: levelIdx === rowLevels.length - 1 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
              borderLeft: levelIdx > 0 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
              borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
              background: 'transparent',
              padding: shouldWrap ? '2px 4px' : 0,
              overflow: 'hidden',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                whiteSpace: shouldWrap ? 'normal' : 'nowrap',
                overflowWrap: shouldWrap ? 'anywhere' : undefined,
                wordBreak: shouldWrap ? 'break-word' : undefined,
                width: shouldWrap && !isVerticalOrientation ? '100%' : undefined,
                height: shouldWrap && isVerticalOrientation ? '100%' : undefined,
                maxHeight: shouldWrap && isVerticalOrientation ? '100%' : undefined,
                textAlign: resolveTextAlignment(horizontalAlign),
                padding: shouldWrap ? 0 : '2px 0',
                ...valuesOrientationStyles,
              }}
            >
              {renderWithBreaks(formatFacetValue(seg.value))}
            </div>
          </div>
        ));
        return <React.Fragment key={`yval-level-${levelIdx}`}>{cells}</React.Fragment>;
      })}

      <FacetStylePopover
        anchorEl={headerAnchor}
        onClose={handleHeaderClose}
        title="Left Facet Header Style"
        scopeLabel={activeHeaderDepth ? `Hierarchy ${activeHeaderDepth.depthIndex + 1}: ${activeHeaderDepth.label}` : undefined}
        fontSize={activeHeaderFontSize}
        orientation={activeHeaderOrientation}
        horizontalAlign={activeHeaderHorizontalAlign}
        verticalAlign={activeHeaderVerticalAlign}
        onFontSizeChange={handleHeaderDepthFontSizeChange}
        onOrientationChange={(orientation) => handleHeaderDepthOrientationChange(orientation as 'horizontal' | 'vertical')}
        onHorizontalAlignChange={(alignment) => handleHeaderDepthAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => handleHeaderDepthAlignChange('vertical', alignment)}
        orientationOptions={['horizontal', 'vertical']}
      />

      <FacetStylePopover
        anchorEl={valuesAnchor}
        onClose={handleValuesClose}
        title="Left Facet Values Style"
        scopeLabel={activeValuesDepth ? `Hierarchy ${activeValuesDepth.depthIndex + 1}: ${activeValuesDepth.label}` : undefined}
        fontSize={valuesStyle.fontSize}
        orientation={activeValuesOrientation}
        horizontalAlign={activeValuesHorizontalAlign}
        verticalAlign={activeValuesVerticalAlign}
        wrapMode={activeValuesWrapMode}
        onFontSizeChange={(fontSize) => handleValuesStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleValuesDepthOrientationChange(orientation as 'horizontal' | 'vertical')}
        onHorizontalAlignChange={(alignment) => handleValuesDepthAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => handleValuesDepthAlignChange('vertical', alignment)}
        onWrapModeChange={(mode) => handleValuesDepthWrapModeChange(mode)}
        orientationOptions={['horizontal', 'vertical']}
      />
    </div>
  );
};

export const LeftFacetLabels = React.memo(LeftFacetLabelsComponent, (prevProps, nextProps) => {
  return (
    prevProps.plotRowsSpec === nextProps.plotRowsSpec &&
    prevProps.baseRows === nextProps.baseRows &&
    prevProps.facetLeftHeaderPx === nextProps.facetLeftHeaderPx &&
    prevProps.facetLeftValueWidthsPx === nextProps.facetLeftValueWidthsPx &&
    prevProps.grid.headers === nextProps.grid.headers &&
    prevProps.grid.layout === nextProps.grid.layout
  );
});
