import React from 'react';
import {
  Popover,
  Box,
  Typography,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  FacetLabelAlign,
  FacetWrapMode,
} from '../../../../contexts/VisualizationContext/types';

export interface FacetStylePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  title: string;
  scopeLabel?: string;
  fontSize: number;
  orientation: string;
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  wrapMode?: FacetWrapMode;
  onFontSizeChange: (fontSize: number) => void;
  onOrientationChange: (orientation: string) => void;
  onHorizontalAlignChange?: (alignment: FacetLabelAlign) => void;
  onVerticalAlignChange?: (alignment: FacetLabelAlign) => void;
  onWrapModeChange?: (wrapMode: FacetWrapMode) => void;
  orientationOptions: string[];
}

const FacetStylePopover: React.FC<FacetStylePopoverProps> = ({
  anchorEl,
  onClose,
  title,
  scopeLabel,
  fontSize,
  orientation,
  horizontalAlign,
  verticalAlign,
  wrapMode,
  onFontSizeChange,
  onOrientationChange,
  onHorizontalAlignChange,
  onVerticalAlignChange,
  onWrapModeChange,
  orientationOptions,
}) => {
  const open = Boolean(anchorEl);

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
      </Box>
    </Popover>
  );
};

export default FacetStylePopover;
