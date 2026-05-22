// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { GridResultModel } from '../../../../observable-plot-generator/gridModel';
import { GRID_DIVIDER_COLOR } from '../../../../config/chartLayoutConfig';
import { buildHierarchicalHeaderSegments } from '../utils/hierarchicalHeaderUtils';
import { renderWithBreaks } from '../utils/labelUtils';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import {
  FacetHeaderLabelStyle,
  FacetTopValuesLabelStyle,
} from '../../../../contexts/VisualizationContext/types';
import FacetStylePopover from './FacetStylePopover';
import { useHeaderStyleState } from './useHeaderStyleState';
import { useValuesStyleState } from './useValuesStyleState';
import { useFacetDepthHandlers } from './useFacetDepthHandlers';
import {
  computeProductSegments,
  formatFacetValue,
  getOrientationStyles,
  resolveDepthValue,
  resolveFlexAlignment,
  resolveTextAlignment,
} from '../utils/facetLabelUtils';

interface TopFacetLabelsProps {
  grid: GridResultModel;
  plotTemplateColumns: string;
  baseCols: number;
  facetTopHeaderPx: number;
  facetTopValueHeightsPx: number[];
}

const TopFacetLabelsComponent: React.FC<TopFacetLabelsProps> = ({
  grid,
  plotTemplateColumns,
  baseCols,
  facetTopHeaderPx,
  facetTopValueHeightsPx,
}) => {
  const { state, dispatch } = useVisualizationContext();
  const { facetLabelStyles } = state;

  const handleHeaderStyleChange = useCallback((updates: Partial<FacetHeaderLabelStyle>) => {
    dispatch({ type: 'SET_FACET_TOP_HEADER_STYLE', payload: updates });
  }, [dispatch]);

  const handleValuesStyleChange = useCallback((updates: Partial<FacetTopValuesLabelStyle>) => {
    dispatch({ type: 'SET_FACET_TOP_VALUES_STYLE', payload: updates });
  }, [dispatch]);

  const colLevels = grid.headers?.cols?.levels || [];

  const headerStyle = facetLabelStyles.topHeader;
  const valuesStyle = facetLabelStyles.topValues;
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
    defaultOrientation: 'horizontal',
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
    defaultOrientation: 'horizontal',
    defaultHorizontalAlign: 'center',
    defaultVerticalAlign: 'center',
    defaultWrapMode: 'wrap',
  });

  const headerDepth = useFacetDepthHandlers<FacetHeaderLabelStyle, 'horizontal' | 'vertical'>(
    headerStyle,
    activeHeaderDepth,
    handleHeaderStyleChange,
  );
  const valuesDepth = useFacetDepthHandlers<FacetTopValuesLabelStyle, 'horizontal' | 'vertical' | 'angled'>(
    valuesStyle,
    activeValuesDepth,
    handleValuesStyleChange,
  );

  if (colLevels.length === 0) return null;

  const fieldLabels = colLevels.map((l) => l.fieldLabel);

  return (
    <div style={{ gridColumn: 1, gridRow: 1 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: plotTemplateColumns,
          gridTemplateRows: `${facetTopHeaderPx}px ${facetTopValueHeightsPx.map((height) => `${height}px`).join(' ')}`,
        }}
      >
        <div
          style={{
            gridColumn: '1 / -1',
            gridRow: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, fieldLabels.length)}, minmax(0, 1fr))`,
          }}
        >
          {fieldLabels.map((label, idx) => {
            const fontSize = resolveDepthValue(
              headerStyle.fontSizeByDepth,
              headerStyle.fontSize,
              idx,
              headerStyle.fontSize,
            );
            const orientation = resolveDepthValue(
              headerStyle.orientationByDepth,
              headerStyle.orientation,
              idx,
              'horizontal',
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
            const orientationStyles = getOrientationStyles(orientation, fontSize);

            return (
              <div
                key={`header-${idx}`}
                onClick={(event) => handleHeaderClick(event, idx, label)}
                title={`Click to edit style: ${label}`}
                style={{
                  display: 'flex',
                  justifyContent: resolveFlexAlignment(horizontalAlign),
                  alignItems: resolveFlexAlignment(verticalAlign),
                  padding: '2px 6px',
                  cursor: 'pointer',
                  textAlign: resolveTextAlignment(horizontalAlign),
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    background: 'white',
                    padding: '2px 6px',
                    ...orientationStyles,
                  }}
                >
                  {renderWithBreaks(label)}
                </div>
              </div>
            );
          })}
        </div>

        {colLevels.map((level, levelIdx) => {
          const orientation = resolveDepthValue(
            valuesStyle.orientationByDepth,
            valuesStyle.orientation,
            levelIdx,
            'horizontal',
          );
          const horizontalAlign = resolveDepthValue(
            valuesStyle.horizontalAlignByDepth,
            valuesStyle.horizontalAlign,
            levelIdx,
            'center',
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
          const shouldWrap = wrapMode === 'wrap';
          const isVerticalOrientation = orientation === 'vertical';
          const orientationStyles = getOrientationStyles(orientation, valuesStyle.fontSize);
          const orderedTuples = grid.headers?.cols?.orderedValueTuples;
          const segments = orderedTuples && orderedTuples.length > 0
            ? buildHierarchicalHeaderSegments(orderedTuples, levelIdx, baseCols, 1)
            : computeProductSegments(colLevels, levelIdx, baseCols);
          const cells = segments.map((seg) => (
            <div
              key={`col-level-${levelIdx}-tuple-${seg.firstTupleIndex}`}
              onClick={(event) => handleValuesClick(event, levelIdx, formatFacetValue(seg.value))}
              title={formatFacetValue(seg.value)}
              style={{
                display: 'flex',
                alignItems: resolveFlexAlignment(verticalAlign),
                justifyContent: resolveFlexAlignment(horizontalAlign),
                height: `${facetTopValueHeightsPx[levelIdx]}px`,
                gridColumn: `${seg.startIndex} / span ${seg.span}`,
                gridRow: levelIdx + 2,
                background: 'transparent',
                borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
                borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
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
                  ...orientationStyles,
                }}
              >
                {renderWithBreaks(formatFacetValue(seg.value))}
              </div>
            </div>
          ));
          return <React.Fragment key={`col-level-row-${levelIdx}`}>{cells}</React.Fragment>;
        })}
      </div>

      <FacetStylePopover
        anchorEl={headerAnchor}
        onClose={handleHeaderClose}
        title="Top Facet Header Style"
        scopeLabel={activeHeaderDepth ? `Hierarchy ${activeHeaderDepth.depthIndex + 1}: ${activeHeaderDepth.label}` : undefined}
        fontSize={activeHeaderFontSize}
        orientation={activeHeaderOrientation}
        horizontalAlign={activeHeaderHorizontalAlign}
        verticalAlign={activeHeaderVerticalAlign}
        onFontSizeChange={headerDepth.onFontSizeChange}
        onOrientationChange={(orientation) => headerDepth.onOrientationChange(orientation as 'horizontal' | 'vertical')}
        onHorizontalAlignChange={(alignment) => headerDepth.onAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => headerDepth.onAlignChange('vertical', alignment)}
        orientationOptions={['horizontal', 'vertical']}
      />

      <FacetStylePopover
        anchorEl={valuesAnchor}
        onClose={handleValuesClose}
        title="Top Facet Values Style"
        scopeLabel={activeValuesDepth ? `Hierarchy ${activeValuesDepth.depthIndex + 1}: ${activeValuesDepth.label}` : undefined}
        fontSize={valuesStyle.fontSize}
        orientation={activeValuesOrientation}
        horizontalAlign={activeValuesHorizontalAlign}
        verticalAlign={activeValuesVerticalAlign}
        wrapMode={activeValuesWrapMode}
        onFontSizeChange={(fontSize) => handleValuesStyleChange({ fontSize })}
        onOrientationChange={(orientation) => valuesDepth.onOrientationChange(orientation as 'horizontal' | 'vertical' | 'angled')}
        onHorizontalAlignChange={(alignment) => valuesDepth.onAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => valuesDepth.onAlignChange('vertical', alignment)}
        onWrapModeChange={(mode) => valuesDepth.onWrapModeChange(mode)}
        orientationOptions={['horizontal', 'vertical', 'angled']}
      />
    </div>
  );
};

export const TopFacetLabels = React.memo(TopFacetLabelsComponent, (prevProps, nextProps) => {
  return (
    prevProps.plotTemplateColumns === nextProps.plotTemplateColumns &&
    prevProps.baseCols === nextProps.baseCols &&
    prevProps.facetTopValueHeightsPx === nextProps.facetTopValueHeightsPx &&
    prevProps.grid.headers === nextProps.grid.headers &&
    prevProps.grid.layout === nextProps.grid.layout
  );
});
