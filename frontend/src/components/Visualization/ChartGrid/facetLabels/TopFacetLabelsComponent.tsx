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
  FacetTopValuesLabelStyle,
  FacetWrapMode,
} from '../../../../contexts/VisualizationContext/types';
import FacetStylePopover from './FacetStylePopover';
import { useHeaderStyleState } from './useHeaderStyleState';
import { useValuesStyleState } from './useValuesStyleState';
import {
  computeProductSegments,
  formatFacetAxisTitle,
  formatFacetValue,
  getOrientationStyles,
  resolveDepthValue,
  resolveFlexAlignment,
  resolveTextAlignment,
  updateDepthOverride,
} from '../utils/facetLabelUtils';

interface TopFacetLabelsProps {
  grid: GridResultModel;
  plotTemplateColumns: string;
  baseCols: number;
  facetTopHeaderPx: number;
  facetTopValueHeightsPx: number[];
  /** Height (px) of each X-axis measure value row (Tableau "Measure Values"). */
  xMeasureBandHeightsPx?: number[];
  showTitle?: boolean;
}

interface TopFacetHeaderTitleProps {
  grid: GridResultModel;
  style?: React.CSSProperties;
}

const TopFacetHeaderTitleComponent: React.FC<TopFacetHeaderTitleProps> = ({ grid, style }) => {
  const { state, dispatch } = useVisualizationContext();
  const { facetLabelStyles } = state;
  const colLevels = grid.headers?.cols?.levels || [];

  const handleHeaderStyleChange = useCallback((updates: Partial<FacetHeaderLabelStyle>) => {
    dispatch({ type: 'SET_FACET_TOP_HEADER_STYLE', payload: updates });
  }, [dispatch]);

  const headerStyle = facetLabelStyles.topHeader;
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
    useDepthOverrides: false,
  });

  const handleHeaderDepthOrientationChange = useCallback((orientation: 'horizontal' | 'vertical') => {
    handleHeaderStyleChange({ orientation });
  }, [handleHeaderStyleChange]);

  const handleHeaderDepthAlignChange = useCallback((axis: 'horizontal' | 'vertical', alignment: FacetLabelAlign) => {
    if (axis === 'horizontal') {
      handleHeaderStyleChange({ horizontalAlign: alignment });
      return;
    }

    handleHeaderStyleChange({ verticalAlign: alignment });
  }, [handleHeaderStyleChange]);

  const handleHeaderDepthFontSizeChange = useCallback((fontSize: number) => {
    handleHeaderStyleChange({ fontSize: Math.max(8, Math.min(26, fontSize)) });
  }, [handleHeaderStyleChange]);

  if (colLevels.length === 0) return null;

  const facetAxisTitle = formatFacetAxisTitle(colLevels);
  const headerFontSize = headerStyle.fontSize;
  const headerOrientation = headerStyle.orientation;
  const headerHorizontalAlign = headerStyle.horizontalAlign ?? 'center';
  const headerVerticalAlign = headerStyle.verticalAlign ?? 'center';
  const headerOrientationStyles = getOrientationStyles(headerOrientation, headerFontSize);

  return (
    <>
      <div
        onClick={(event) => handleHeaderClick(event, 0, facetAxisTitle)}
        title={`Click to edit style: ${facetAxisTitle}`}
        style={{
          display: 'flex',
          justifyContent: resolveFlexAlignment(headerHorizontalAlign),
          alignItems: resolveFlexAlignment(headerVerticalAlign),
          padding: '2px 6px',
          cursor: 'pointer',
          textAlign: resolveTextAlignment(headerHorizontalAlign),
          ...style,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            background: 'white',
            padding: '2px 6px',
            ...headerOrientationStyles,
          }}
        >
          {renderWithBreaks(facetAxisTitle)}
        </div>
      </div>

      <FacetStylePopover
        anchorEl={headerAnchor}
        onClose={handleHeaderClose}
        title="Top Facet Header Style"
        scopeLabel={activeHeaderDepth ? `Facet names: ${activeHeaderDepth.label}` : undefined}
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
    </>
  );
};

const TopFacetLabelsComponent: React.FC<TopFacetLabelsProps> = ({
  grid,
  plotTemplateColumns,
  baseCols,
  facetTopHeaderPx,
  facetTopValueHeightsPx,
  xMeasureBandHeightsPx = [],
  showTitle = true,
}) => {
  const { state, dispatch } = useVisualizationContext();
  const { facetLabelStyles } = state;

  const handleValuesStyleChange = useCallback((updates: Partial<FacetTopValuesLabelStyle>) => {
    dispatch({ type: 'SET_FACET_TOP_VALUES_STYLE', payload: updates });
  }, [dispatch]);

  const colLevels = grid.headers?.cols?.levels || [];

  const valuesStyle = facetLabelStyles.topValues;
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

  const handleValuesDepthOrientationChange = useCallback((orientation: 'horizontal' | 'vertical' | 'angled') => {
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

  const measureBands = grid.measureBands?.cols ?? [];
  const bandCount = Math.min(xMeasureBandHeightsPx.length, measureBands.length);
  const bodyColCount = grid.layout?.columns || 1;

  if (colLevels.length === 0 && bandCount === 0) return null;

  // Track layout: optional title/header row + one row per hierarchy level, then
  // one value row per X-axis measure band.
  const dimRowSizes = colLevels.length > 0
    ? [`${facetTopHeaderPx}px`, ...facetTopValueHeightsPx.map((height) => `${height}px`)]
    : [];
  const dimRowCount = dimRowSizes.length;
  const bandRowSizes = xMeasureBandHeightsPx.slice(0, bandCount).map((height) => `${height}px`);
  const gridTemplateRows = [...dimRowSizes, ...bandRowSizes].join(' ') || '0px';

  return (
    <div style={{ gridColumn: 1, gridRow: 1 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: plotTemplateColumns,
          gridTemplateRows,
        }}
      >
        {Array.from({ length: bandCount }).map((_, bandIdx) => {
          const band = measureBands[bandIdx];
          const rowTrack = dimRowCount + bandIdx + 1;
          return (
            <React.Fragment key={`xmeasure-band-${bandIdx}`}>
              {Array.from({ length: bodyColCount }).map((__, colIdx) => {
                const value = band.values[colIdx] ?? '';
                return (
                  <div
                    key={`xmeasure-band-${bandIdx}-col-${colIdx}`}
                    title={value ? `${band.label}: ${value}` : band.label}
                    style={{
                      gridColumn: colIdx + 1,
                      gridRow: rowTrack,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: `${xMeasureBandHeightsPx[bandIdx]}px`,
                      borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
                      borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: `${valuesStyle.fontSize}px`,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {value}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
        {showTitle && (
          <TopFacetHeaderTitleComponent
            grid={grid}
            style={{
              gridColumn: '1 / -1',
              gridRow: 1,
            }}
          />
        )}

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
        onOrientationChange={(orientation) => handleValuesDepthOrientationChange(orientation as 'horizontal' | 'vertical' | 'angled')}
        onHorizontalAlignChange={(alignment) => handleValuesDepthAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => handleValuesDepthAlignChange('vertical', alignment)}
        onWrapModeChange={(mode) => handleValuesDepthWrapModeChange(mode)}
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
    prevProps.xMeasureBandHeightsPx === nextProps.xMeasureBandHeightsPx &&
    prevProps.showTitle === nextProps.showTitle &&
    prevProps.grid.headers === nextProps.grid.headers &&
    prevProps.grid.layout === nextProps.grid.layout &&
    prevProps.grid.measureBands === nextProps.grid.measureBands
  );
});

export const TopFacetHeaderTitle = React.memo(TopFacetHeaderTitleComponent, (prevProps, nextProps) => {
  return prevProps.grid.headers === nextProps.grid.headers && prevProps.style === nextProps.style;
});
