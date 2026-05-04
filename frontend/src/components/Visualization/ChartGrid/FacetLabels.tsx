import React, { useState, useCallback } from 'react';
import { renderWithBreaks } from './utils/labelUtils';
import {
  Popover,
  Box,
  Typography,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { GridResultModel } from '../../../observable-plot-generator/gridModel';
import { GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';
import { formatDateTick } from '../../../observable-plot-generator/utils/dateFormatUtils';
import { buildHierarchicalHeaderSegments } from './utils/hierarchicalHeaderUtils';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import {
  FacetLabelAlign,
  FacetWrapMode,
  FacetHeaderLabelStyle,
  FacetTopValuesLabelStyle,
  FacetLeftValuesLabelStyle,
} from '../../../contexts/VisualizationContext/types';

/**
 * Format a facet label value. Uses ISO-style format for Dates, otherwise String().
 */
function formatFacetValue(val: any): string {
  if (val instanceof Date) {
    return formatDateTick(val);
  }
  return String(val);
}

/**
 * Fallback span computation used when ordered tuples are absent.
 * Assumes the full Cartesian product of level values is present.
 */
function computeProductSegments(
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
      // firstTupleIndex computed in tuple coordinates (cells / baseSpan)
      const firstTupleIndex = (groupStart + i * span) / Math.max(1, baseSpan);
      segments.push({ value: val, startIndex: startTrack, span, firstTupleIndex });
    });
  }
  return segments;
}

/**
 * Get CSS properties for text orientation
 */
function getOrientationStyles(
  orientation: 'horizontal' | 'vertical' | 'angled',
  fontSize: number
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

function resolveDepthValue<T>(
  byDepth: T[] | undefined,
  shared: T | undefined,
  depthIndex: number,
  fallback: T,
): T {
  return byDepth?.[depthIndex] ?? shared ?? fallback;
}

function resolveFlexAlignment(alignment: FacetLabelAlign): React.CSSProperties['justifyContent'] {
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

function resolveTextAlignment(alignment: FacetLabelAlign): React.CSSProperties['textAlign'] {
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

function updateDepthOverride<T>(
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

// ============================================================================
// FACET STYLE POPOVER
// ============================================================================

interface FacetStylePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  title: string;
  scopeLabel?: string;
  fontSize: number;
  orientation: string;
  widthPx?: number | null;
  heightPx?: number | null;
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  wrapMode?: FacetWrapMode;
  onFontSizeChange: (fontSize: number) => void;
  onOrientationChange: (orientation: string) => void;
  onWidthChange?: (widthPx: number | null) => void;
  onHeightChange?: (heightPx: number | null) => void;
  onHorizontalAlignChange?: (alignment: FacetLabelAlign) => void;
  onVerticalAlignChange?: (alignment: FacetLabelAlign) => void;
  onWrapModeChange?: (wrapMode: FacetWrapMode) => void;
  orientationOptions: string[];
  showWidthControl?: boolean;
  showHeightControl?: boolean;
}

const FacetStylePopover: React.FC<FacetStylePopoverProps> = ({
  anchorEl,
  onClose,
  title,
  scopeLabel,
  fontSize,
  orientation,
  widthPx,
  heightPx,
  horizontalAlign,
  verticalAlign,
  wrapMode,
  onFontSizeChange,
  onOrientationChange,
  onWidthChange,
  onHeightChange,
  onHorizontalAlignChange,
  onVerticalAlignChange,
  onWrapModeChange,
  orientationOptions,
  showWidthControl,
  showHeightControl,
}) => {
  const open = Boolean(anchorEl);
  const isAutoWidth = widthPx === null;
  const isAutoHeight = heightPx === null;

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      PaperProps={{ sx: { p: 2, width: 240 } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>

        {scopeLabel && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {scopeLabel}
          </Typography>
        )}

        <Box>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Font Size: {fontSize}px
          </Typography>
          <Slider
            size="small"
            value={fontSize}
            min={8}
            max={26}
            step={1}
            onChange={(_, value) => onFontSizeChange(Array.isArray(value) ? value[0] : value)}
            marks={[
              { value: 8, label: '8' },
              { value: 26, label: '26' },
            ]}
            sx={{ mx: 0.5 }}
          />
        </Box>

        <Box>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Orientation
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={orientation}
            onChange={(_, val) => val && onOrientationChange(val)}
            sx={{
              '& .MuiToggleButton-root': {
                py: 0.5,
                px: 1.5,
                fontSize: '0.75rem',
                textTransform: 'capitalize',
              },
            }}
          >
            {orientationOptions.map((opt) => (
              <ToggleButton key={opt} value={opt}>
                {opt}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {onHorizontalAlignChange && horizontalAlign && (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Horizontal Align
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={horizontalAlign}
              onChange={(_, val) => val && onHorizontalAlignChange(val)}
              sx={{
                '& .MuiToggleButton-root': {
                  py: 0.5,
                  px: 1.5,
                  fontSize: '0.75rem',
                },
              }}
            >
              <ToggleButton value="start">Start</ToggleButton>
              <ToggleButton value="center">Center</ToggleButton>
              <ToggleButton value="end">End</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {onVerticalAlignChange && verticalAlign && (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Vertical Align
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={verticalAlign}
              onChange={(_, val) => val && onVerticalAlignChange(val)}
              sx={{
                '& .MuiToggleButton-root': {
                  py: 0.5,
                  px: 1.5,
                  fontSize: '0.75rem',
                },
              }}
            >
              <ToggleButton value="start">Start</ToggleButton>
              <ToggleButton value="center">Center</ToggleButton>
              <ToggleButton value="end">End</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {onWrapModeChange && wrapMode && (
          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Wrap Mode
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={wrapMode}
              onChange={(_, val) => val && onWrapModeChange(val)}
              sx={{
                '& .MuiToggleButton-root': {
                  py: 0.5,
                  px: 1.5,
                  fontSize: '0.75rem',
                },
              }}
            >
              <ToggleButton value="wrap">Wrap</ToggleButton>
              <ToggleButton value="nowrap">No Wrap</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        {showWidthControl && onWidthChange && (
          <Box>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isAutoWidth}
                  onChange={(e) => onWidthChange(e.target.checked ? null : 30)}
                />
              }
              label={<Typography variant="body2">Auto Width</Typography>}
              sx={{ ml: 0 }}
            />
            {!isAutoWidth && (
              <TextField
                size="small"
                type="number"
                label="Width (px)"
                value={widthPx ?? 30}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) onWidthChange(val);
                }}
                inputProps={{ min: 10, max: 200, step: 5 }}
                sx={{ mt: 1, width: '100%' }}
              />
            )}
          </Box>
        )}

        {showHeightControl && onHeightChange && (
          <Box>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isAutoHeight}
                  onChange={(e) => onHeightChange(e.target.checked ? null : 30)}
                />
              }
              label={<Typography variant="body2">Auto Height</Typography>}
              sx={{ ml: 0 }}
            />
            {!isAutoHeight && (
              <TextField
                size="small"
                type="number"
                label="Height (px)"
                value={heightPx ?? 30}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val > 0) onHeightChange(val);
                }}
                inputProps={{ min: 10, max: 200, step: 5 }}
                sx={{ mt: 1, width: '100%' }}
              />
            )}
          </Box>
        )}
      </Box>
    </Popover>
  );
};

// ============================================================================
// TOP FACET LABELS
// ============================================================================

interface TopFacetLabelsProps {
  grid: GridResultModel;
  plotTemplateColumns: string;
  baseCols: number;
  facetTopValueHeightsPx: number[];
}

const TopFacetLabelsComponent: React.FC<TopFacetLabelsProps> = ({
  grid,
  plotTemplateColumns,
  baseCols,
  facetTopValueHeightsPx,
}) => {
  const { state, dispatch } = useVisualizationContext();
  const { facetLabelStyles } = state;

  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);
  const [valuesAnchor, setValuesAnchor] = useState<HTMLElement | null>(null);

  const handleHeaderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setHeaderAnchor(e.currentTarget);
  }, []);

  const handleValuesClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setValuesAnchor(e.currentTarget);
  }, []);

  const handleHeaderStyleChange = useCallback((updates: Partial<FacetHeaderLabelStyle>) => {
    dispatch({ type: 'SET_FACET_TOP_HEADER_STYLE', payload: updates });
  }, [dispatch]);

  const handleValuesStyleChange = useCallback((updates: Partial<FacetTopValuesLabelStyle>) => {
    dispatch({ type: 'SET_FACET_TOP_VALUES_STYLE', payload: updates });
  }, [dispatch]);

  const colLevels = grid.headers?.cols?.levels || [];
  if (colLevels.length === 0) return null;

  const headerStyle = facetLabelStyles.topHeader;
  const valuesStyle = facetLabelStyles.topValues;
  const headerOrientationStyles = getOrientationStyles(headerStyle.orientation, headerStyle.fontSize);
  const valuesOrientationStyles = getOrientationStyles(valuesStyle.orientation, valuesStyle.fontSize);

  const fieldLabels = colLevels.map((l) => l.fieldLabel);

  return (
    <div style={{ gridColumn: 1, gridRow: 1 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: plotTemplateColumns,
          gridTemplateRows: `20px ${facetTopValueHeightsPx.map((height) => `${height}px`).join(' ')}`,
        }}
      >
        <div
          style={{
            gridColumn: '1 / -1',
            gridRow: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {fieldLabels.map((label, idx) => (
            <div
              key={`header-${idx}`}
              onClick={handleHeaderClick}
              title={`Click to edit style: ${label}`}
              style={{
                position: 'sticky',
                left: 0,
                right: 0,
                width: 'max-content',
                fontWeight: 600,
                background: 'white',
                padding: '2px 6px',
                zIndex: 2,
                cursor: 'pointer',
                ...headerOrientationStyles,
              }}
            >
              {renderWithBreaks(label)}
            </div>
          ))}
        </div>

        {colLevels.map((level, levelIdx) => {
          const orderedTuples = grid.headers?.cols?.orderedValueTuples;
          const segments = orderedTuples && orderedTuples.length > 0
            ? buildHierarchicalHeaderSegments(orderedTuples, levelIdx, baseCols, 1)
            : computeProductSegments(colLevels, levelIdx, baseCols);
          const cells = segments.map((seg) => (
            <div
              key={`col-level-${levelIdx}-tuple-${seg.firstTupleIndex}`}
              onClick={handleValuesClick}
              title={formatFacetValue(seg.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: `${facetTopValueHeightsPx[levelIdx]}px`,
                gridColumn: `${seg.startIndex} / span ${seg.span}`,
                gridRow: levelIdx + 2,
                background: 'transparent',
                borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
                borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
                padding: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                ...valuesOrientationStyles,
              }}
            >
              {formatFacetValue(seg.value)}
            </div>
          ));
          return <React.Fragment key={`col-level-row-${levelIdx}`}>{cells}</React.Fragment>;
        })}
      </div>

      <FacetStylePopover
        anchorEl={headerAnchor}
        onClose={() => setHeaderAnchor(null)}
        title="Top Facet Header Style"
        fontSize={headerStyle.fontSize}
        orientation={headerStyle.orientation}
        onFontSizeChange={(fontSize) => handleHeaderStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleHeaderStyleChange({ orientation: orientation as 'horizontal' | 'vertical' })}
        orientationOptions={['horizontal', 'vertical']}
      />

      <FacetStylePopover
        anchorEl={valuesAnchor}
        onClose={() => setValuesAnchor(null)}
        title="Top Facet Values Style"
        fontSize={valuesStyle.fontSize}
        orientation={valuesStyle.orientation}
        heightPx={valuesStyle.heightPx}
        onFontSizeChange={(fontSize) => handleValuesStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleValuesStyleChange({ orientation: orientation as 'horizontal' | 'vertical' | 'angled' })}
        onHeightChange={(heightPx) => handleValuesStyleChange({ heightPx })}
        orientationOptions={['horizontal', 'vertical', 'angled']}
        showHeightControl
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

// ============================================================================
// LEFT FACET LABELS
// ============================================================================

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
  const { facetLabelStyles } = state;

  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);
  const [valuesAnchor, setValuesAnchor] = useState<HTMLElement | null>(null);
  const [activeHeaderDepth, setActiveHeaderDepth] = useState<{ depthIndex: number; label: string } | null>(null);
  const [activeValuesDepth, setActiveValuesDepth] = useState<{ depthIndex: number; label: string } | null>(null);

  const handleHeaderClick = useCallback((e: React.MouseEvent<HTMLDivElement>, depthIndex: number, label: string) => {
    setHeaderAnchor(e.currentTarget);
    setActiveHeaderDepth({ depthIndex, label });
  }, []);

  const handleValuesClick = useCallback((e: React.MouseEvent<HTMLDivElement>, depthIndex: number, label: string) => {
    setValuesAnchor(e.currentTarget);
    setActiveValuesDepth({ depthIndex, label });
  }, []);

  const handleHeaderStyleChange = useCallback((updates: Partial<FacetHeaderLabelStyle & { widthPx: number | null }>) => {
    dispatch({ type: 'SET_FACET_LEFT_HEADER_STYLE', payload: updates });
  }, [dispatch]);

  const handleValuesStyleChange = useCallback((updates: Partial<FacetLeftValuesLabelStyle>) => {
    dispatch({ type: 'SET_FACET_LEFT_VALUES_STYLE', payload: updates });
  }, [dispatch]);
  const headerStyle = facetLabelStyles.leftHeader;
  const valuesStyle = facetLabelStyles.leftValues;
  const activeHeaderDepthIndex = activeHeaderDepth?.depthIndex ?? 0;
  const activeValuesDepthIndex = activeValuesDepth?.depthIndex ?? 0;

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

  const rowLevels = grid.headers?.rows?.levels || [];
  if (rowLevels.length === 0) return null;

  const headerOrientationStyles = getOrientationStyles(headerStyle.orientation, headerStyle.fontSize);
  const valuesOrientationStyles = getOrientationStyles(valuesStyle.orientation, valuesStyle.fontSize);
  const activeHeaderHorizontalAlign = resolveDepthValue(
    headerStyle.horizontalAlignByDepth,
    headerStyle.horizontalAlign,
    activeHeaderDepthIndex,
    'center',
  );
  const activeHeaderVerticalAlign = resolveDepthValue(
    headerStyle.verticalAlignByDepth,
    headerStyle.verticalAlign,
    activeHeaderDepthIndex,
    'center',
  );
  const activeValuesHorizontalAlign = resolveDepthValue(
    valuesStyle.horizontalAlignByDepth,
    valuesStyle.horizontalAlign,
    activeValuesDepthIndex,
    'start',
  );
  const activeValuesVerticalAlign = resolveDepthValue(
    valuesStyle.verticalAlignByDepth,
    valuesStyle.verticalAlign,
    activeValuesDepthIndex,
    'center',
  );
  const activeValuesWrapMode = resolveDepthValue(
    valuesStyle.wrapModeByDepth,
    valuesStyle.wrapMode,
    activeValuesDepthIndex,
    'wrap',
  );

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
        {fieldLabels.map((label, idx) => (
          (() => {
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
          })()
        ))}
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
        const shouldWrap = wrapMode === 'wrap';
        const isVerticalOrientation = valuesStyle.orientation === 'vertical';
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
        onClose={() => {
          setHeaderAnchor(null);
          setActiveHeaderDepth(null);
        }}
        title="Left Facet Header Style"
        scopeLabel={activeHeaderDepth ? `Hierarchy ${activeHeaderDepth.depthIndex + 1}: ${activeHeaderDepth.label}` : undefined}
        fontSize={headerStyle.fontSize}
        orientation={headerStyle.orientation}
        widthPx={headerStyle.widthPx}
        horizontalAlign={activeHeaderHorizontalAlign}
        verticalAlign={activeHeaderVerticalAlign}
        onFontSizeChange={(fontSize) => handleHeaderStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleHeaderStyleChange({ orientation: orientation as 'horizontal' | 'vertical' })}
        onWidthChange={(widthPx) => handleHeaderStyleChange({ widthPx })}
        onHorizontalAlignChange={(alignment) => handleHeaderDepthAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => handleHeaderDepthAlignChange('vertical', alignment)}
        orientationOptions={['horizontal', 'vertical']}
        showWidthControl
      />

      <FacetStylePopover
        anchorEl={valuesAnchor}
        onClose={() => {
          setValuesAnchor(null);
          setActiveValuesDepth(null);
        }}
        title="Left Facet Values Style"
        scopeLabel={activeValuesDepth ? `Hierarchy ${activeValuesDepth.depthIndex + 1}: ${activeValuesDepth.label}` : undefined}
        fontSize={valuesStyle.fontSize}
        orientation={valuesStyle.orientation}
        widthPx={valuesStyle.widthPx}
        horizontalAlign={activeValuesHorizontalAlign}
        verticalAlign={activeValuesVerticalAlign}
        wrapMode={activeValuesWrapMode}
        onFontSizeChange={(fontSize) => handleValuesStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleValuesStyleChange({ orientation: orientation as 'horizontal' | 'vertical' })}
        onWidthChange={(widthPx) => handleValuesStyleChange({ widthPx })}
        onHorizontalAlignChange={(alignment) => handleValuesDepthAlignChange('horizontal', alignment)}
        onVerticalAlignChange={(alignment) => handleValuesDepthAlignChange('vertical', alignment)}
        onWrapModeChange={(mode) => handleValuesDepthWrapModeChange(mode)}
        orientationOptions={['horizontal', 'vertical']}
        showWidthControl
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
