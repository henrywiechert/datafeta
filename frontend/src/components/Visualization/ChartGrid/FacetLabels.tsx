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
import { PlotResult } from '../../../observable-plot-generator/types';
import { GRID_DIVIDER_COLOR } from '../../../config/chartLayoutConfig';
import { formatDateTick } from '../../../observable-plot-generator/utils/dateFormatUtils';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import {
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

// ============================================================================
// FACET STYLE POPOVER
// ============================================================================

interface FacetStylePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  title: string;
  fontSize: number;
  orientation: string;
  widthPx?: number | null;
  heightPx?: number | null;
  onFontSizeChange: (fontSize: number) => void;
  onOrientationChange: (orientation: string) => void;
  onWidthChange?: (widthPx: number | null) => void;
  onHeightChange?: (heightPx: number | null) => void;
  orientationOptions: string[];
  showWidthControl?: boolean;
  showHeightControl?: boolean;
}

const FacetStylePopover: React.FC<FacetStylePopoverProps> = ({
  anchorEl,
  onClose,
  title,
  fontSize,
  orientation,
  widthPx,
  heightPx,
  onFontSizeChange,
  onOrientationChange,
  onWidthChange,
  onHeightChange,
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

        {/* Font Size */}
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

        {/* Orientation */}
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

        {/* Width Control */}
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

        {/* Height Control */}
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
  spec: PlotResult;
  plotTemplateColumns: string;
  baseCols: number;
  facetTopValuesPx: number;
}

const TopFacetLabelsComponent: React.FC<TopFacetLabelsProps> = ({
  spec,
  plotTemplateColumns,
  baseCols,
  facetTopValuesPx,
}) => {
  // All hooks must be called unconditionally before any early returns
  const { state, dispatch } = useVisualizationContext();
  const { facetLabelStyles } = state;

  // Popover states
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

  // Early return after all hooks
  const colLevels = spec.facetLabels?.colsLevels || [];
  if (colLevels.length === 0) return null;

  const headerStyle = facetLabelStyles.topHeader;
  const valuesStyle = facetLabelStyles.topValues;
  const headerOrientationStyles = getOrientationStyles(headerStyle.orientation, headerStyle.fontSize);
  const valuesOrientationStyles = getOrientationStyles(valuesStyle.orientation, valuesStyle.fontSize);

  // Break apart field labels
  const fieldLabels = colLevels.map((l: { fieldLabel: string }) => l.fieldLabel);

  return (
    <div style={{ gridColumn: 1, gridRow: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: plotTemplateColumns }}>
        {/* Header row with field names */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', gap: '8px' }}>
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

        {/* Value cells */}
        {colLevels.map((level: { values: any[] }, levelIdx: number) => {
          const counts = colLevels.map((l: { values: any[] }) => l.values.length);
          const innerProduct = counts.slice(levelIdx + 1).reduce((a: number, b: number) => a * b, 1) || 1;
          const outerProduct = counts.slice(0, levelIdx).reduce((a: number, b: number) => a * b, 1) || 1;
          const span = baseCols * innerProduct;
          const groupSpan = span * level.values.length;
          const cells: React.ReactNode[] = [];
          for (let r = 0; r < outerProduct; r++) {
            const groupStart = r * groupSpan;
            level.values.forEach((val: any, i: number) => {
              const startCol = 1 + groupStart + i * span;
              cells.push(
                <div
                  key={`col-level-${levelIdx}-seg-${r}-val-${i}`}
                  onClick={handleValuesClick}
                  title={formatFacetValue(val)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: `${facetTopValuesPx}px`,
                    gridColumn: `${startCol} / span ${span}`,
                    background: 'transparent',
                    borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
                    borderRight: `1px solid ${GRID_DIVIDER_COLOR}`,
                    padding: 0,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    ...valuesOrientationStyles,
                  }}
                >
                  {formatFacetValue(val)}
                </div>
              );
            });
          }
          return <React.Fragment key={`col-level-row-${levelIdx}`}>{cells}</React.Fragment>;
        })}
      </div>

      {/* Header style popover */}
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

      {/* Values style popover */}
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
    prevProps.facetTopValuesPx === nextProps.facetTopValuesPx &&
    prevProps.spec.facetLabels === nextProps.spec.facetLabels &&
    prevProps.spec.layout === nextProps.spec.layout
  );
});

// ============================================================================
// LEFT FACET LABELS
// ============================================================================

interface LeftFacetLabelsProps {
  spec: PlotResult;
  plotRowsSpec: string;
  baseRows: number;
  facetLeftHeaderPx: number;
  facetLeftValuesPx: number;
}

const LeftFacetLabelsComponent: React.FC<LeftFacetLabelsProps> = ({
  spec,
  plotRowsSpec,
  baseRows,
  facetLeftHeaderPx,
  facetLeftValuesPx,
}) => {
  // All hooks must be called unconditionally before any early returns
  const { state, dispatch } = useVisualizationContext();
  const { facetLabelStyles } = state;

  // Popover states
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);
  const [valuesAnchor, setValuesAnchor] = useState<HTMLElement | null>(null);

  const handleHeaderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setHeaderAnchor(e.currentTarget);
  }, []);

  const handleValuesClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setValuesAnchor(e.currentTarget);
  }, []);

  const handleHeaderStyleChange = useCallback((updates: Partial<FacetHeaderLabelStyle & { widthPx: number | null }>) => {
    dispatch({ type: 'SET_FACET_LEFT_HEADER_STYLE', payload: updates });
  }, [dispatch]);

  const handleValuesStyleChange = useCallback((updates: Partial<FacetLeftValuesLabelStyle>) => {
    dispatch({ type: 'SET_FACET_LEFT_VALUES_STYLE', payload: updates });
  }, [dispatch]);

  // Early return after all hooks
  const rowLevels = spec.facetLabels?.rowsLevels || [];
  if (rowLevels.length === 0) return null;

  const yLevelsCount = rowLevels.length;
  const headerStyle = facetLabelStyles.leftHeader;
  const valuesStyle = facetLabelStyles.leftValues;
  const headerOrientationStyles = getOrientationStyles(headerStyle.orientation, headerStyle.fontSize);
  const valuesOrientationStyles = getOrientationStyles(valuesStyle.orientation, valuesStyle.fontSize);

  // Break apart field labels
  const fieldLabels = rowLevels.map((l: { fieldLabel: string }) => l.fieldLabel);

  return (
    <div
      style={{
        gridColumn: 1,
        gridRow: '1 / span ' + (spec.layout?.rows || 1),
        display: 'grid',
        gridTemplateColumns: `${facetLeftHeaderPx}px ${new Array(yLevelsCount).fill(`${facetLeftValuesPx}px`).join(' ')}`,
        gridTemplateRows: plotRowsSpec,
        alignItems: 'stretch',
      }}
    >
      {/* Header column with field names */}
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
          <div
            key={`header-${idx}`}
            onClick={handleHeaderClick}
            title={`Click to edit style: ${label}`}
            style={{
              fontWeight: 600,
              background: 'white',
              padding: '4px 2px',
              cursor: 'pointer',
              ...headerOrientationStyles,
            }}
          >
            {renderWithBreaks(label)}
          </div>
        ))}
      </div>

      {/* Value cells */}
      {rowLevels.map((level: { values: any[] }, levelIdx: number) => {
        const counts = rowLevels.map((l: { values: any[] }) => l.values.length);
        const innerProduct = counts.slice(levelIdx + 1).reduce((a: number, b: number) => a * b, 1) || 1;
        const outerProduct = counts.slice(0, levelIdx).reduce((a: number, b: number) => a * b, 1) || 1;
        const span = baseRows * innerProduct;
        const groupSpan = span * level.values.length;
        const cells: React.ReactNode[] = [];
        for (let r = 0; r < outerProduct; r++) {
          const groupStart = r * groupSpan;
          level.values.forEach((val: any, i: number) => {
            const startRow = groupStart + i * span + 1;
            cells.push(
              <div
                key={`yval-level-${levelIdx}-rep-${r}-val-${i}`}
                onClick={handleValuesClick}
                title={formatFacetValue(val)}
                style={{
                  gridColumn: levelIdx + 2,
                  gridRow: `${startRow} / span ${span}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRight: levelIdx === rowLevels.length - 1 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
                  borderLeft: levelIdx > 0 ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
                  borderBottom: `1px solid ${GRID_DIVIDER_COLOR}`,
                  background: 'transparent',
                  padding: 0,
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    whiteSpace: 'nowrap',
                    padding: '2px 0',
                    ...valuesOrientationStyles,
                  }}
                >
                  {formatFacetValue(val)}
                </div>
              </div>
            );
          });
        }
        return <React.Fragment key={`yval-level-${levelIdx}`}>{cells}</React.Fragment>;
      })}

      {/* Header style popover */}
      <FacetStylePopover
        anchorEl={headerAnchor}
        onClose={() => setHeaderAnchor(null)}
        title="Left Facet Header Style"
        fontSize={headerStyle.fontSize}
        orientation={headerStyle.orientation}
        widthPx={headerStyle.widthPx}
        onFontSizeChange={(fontSize) => handleHeaderStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleHeaderStyleChange({ orientation: orientation as 'horizontal' | 'vertical' })}
        onWidthChange={(widthPx) => handleHeaderStyleChange({ widthPx })}
        orientationOptions={['horizontal', 'vertical']}
        showWidthControl
      />

      {/* Values style popover */}
      <FacetStylePopover
        anchorEl={valuesAnchor}
        onClose={() => setValuesAnchor(null)}
        title="Left Facet Values Style"
        fontSize={valuesStyle.fontSize}
        orientation={valuesStyle.orientation}
        widthPx={valuesStyle.widthPx}
        onFontSizeChange={(fontSize) => handleValuesStyleChange({ fontSize })}
        onOrientationChange={(orientation) => handleValuesStyleChange({ orientation: orientation as 'horizontal' | 'vertical' })}
        onWidthChange={(widthPx) => handleValuesStyleChange({ widthPx })}
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
    prevProps.facetLeftValuesPx === nextProps.facetLeftValuesPx &&
    prevProps.spec.facetLabels === nextProps.spec.facetLabels &&
    prevProps.spec.layout === nextProps.spec.layout
  );
});
