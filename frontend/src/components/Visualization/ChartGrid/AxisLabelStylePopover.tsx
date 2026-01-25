import React from 'react';
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
import { XAxisLabelStyle, YAxisLabelStyle } from '../../../contexts/VisualizationContext/types';

// Base props shared by both axis types
interface BaseAxisLabelStylePopoverProps {
  /** Anchor element for the popover */
  anchorEl: HTMLElement | null;
  /** Close handler */
  onClose: () => void;
}

// X-axis specific props
interface XAxisLabelStylePopoverProps extends BaseAxisLabelStylePopoverProps {
  axis: 'x';
  style: XAxisLabelStyle;
  onChange: (updates: Partial<XAxisLabelStyle>) => void;
}

// Y-axis specific props
interface YAxisLabelStylePopoverProps extends BaseAxisLabelStylePopoverProps {
  axis: 'y';
  style: YAxisLabelStyle;
  onChange: (updates: Partial<YAxisLabelStyle>) => void;
}

type AxisLabelStylePopoverProps = XAxisLabelStylePopoverProps | YAxisLabelStylePopoverProps;

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 26;

const X_ORIENTATIONS: { value: XAxisLabelStyle['orientation']; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'angled', label: 'Angled' },
];

const Y_ORIENTATIONS: { value: YAxisLabelStyle['orientation']; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

/**
 * AxisLabelStylePopover - Popover menu for configuring axis label styles
 * 
 * Provides controls for:
 * - Font size (8-16px slider)
 * - Orientation (horizontal/vertical/angled)
 * - Width override (Y-axis only, auto or manual px)
 */
const AxisLabelStylePopover: React.FC<AxisLabelStylePopoverProps> = (props) => {
  const { anchorEl, onClose, axis, style, onChange } = props;
  const open = Boolean(anchorEl);
  const yStyle = axis === 'y' ? (style as YAxisLabelStyle) : null;
  const isAutoWidth = yStyle?.widthPx === null;

  const handleFontSizeChange = (_: Event, value: number | number[]) => {
    const fontSize = Array.isArray(value) ? value[0] : value;
    // Cast to any to avoid type narrowing issues with discriminated union
    (onChange as (updates: { fontSize: number }) => void)({ fontSize });
  };

  const handleOrientationChange = (
    _: React.MouseEvent<HTMLElement>,
    newOrientation: string | null
  ) => {
    if (newOrientation) {
      // Cast to any to avoid type narrowing issues with discriminated union
      (onChange as (updates: { orientation: string }) => void)({ orientation: newOrientation });
    }
  };

  const handleAutoWidthToggle = (checked: boolean) => {
    if (axis === 'y') {
      const yOnChange = onChange as (updates: Partial<YAxisLabelStyle>) => void;
      if (checked) {
        // Switch to auto width
        yOnChange({ widthPx: null });
      } else {
        // Switch to manual, default to 80px
        yOnChange({ widthPx: 80 });
      }
    }
  };

  const handleWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (axis === 'y') {
      const value = parseInt(event.target.value, 10);
      if (!isNaN(value) && value > 0) {
        const yOnChange = onChange as (updates: Partial<YAxisLabelStyle>) => void;
        yOnChange({ widthPx: value });
      }
    }
  };

  const orientations = axis === 'x' ? X_ORIENTATIONS : Y_ORIENTATIONS;

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
          {axis === 'x' ? 'X-Axis' : 'Y-Axis'} Label Style
        </Typography>

        {/* Font Size */}
        <Box>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Font Size: {style.fontSize}px
          </Typography>
          <Slider
            size="small"
            value={style.fontSize}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            onChange={handleFontSizeChange}
            marks={[
              { value: FONT_SIZE_MIN, label: `${FONT_SIZE_MIN}` },
              { value: FONT_SIZE_MAX, label: `${FONT_SIZE_MAX}` },
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
            value={style.orientation}
            onChange={handleOrientationChange}
            sx={{
              '& .MuiToggleButton-root': {
                py: 0.5,
                px: 1.5,
                fontSize: '0.75rem',
                textTransform: 'none',
              },
            }}
          >
            {orientations.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {/* Width Override (Y-axis only) */}
        {axis === 'y' && (
          <Box>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isAutoWidth}
                  onChange={(e) => handleAutoWidthToggle(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">Auto Width</Typography>
              }
              sx={{ ml: 0 }}
            />
            {!isAutoWidth && yStyle && (
              <TextField
                size="small"
                type="number"
                label="Width (px)"
                value={yStyle.widthPx ?? 80}
                onChange={handleWidthChange}
                inputProps={{ min: 20, max: 300, step: 10 }}
                sx={{ mt: 1, width: '100%' }}
              />
            )}
          </Box>
        )}
      </Box>
    </Popover>
  );
};

export default React.memo(AxisLabelStylePopover);
