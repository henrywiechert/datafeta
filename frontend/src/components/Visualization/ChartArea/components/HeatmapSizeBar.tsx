import React from 'react';
import { Box, Button, Divider, Typography } from '@mui/material';
import { HeatmapSizeToolbarState } from '../../ChartGrid/ChartGrid';

interface HeatmapSizeBarProps {
  toolbarState: HeatmapSizeToolbarState | null;
}

const controlButtonSx = {
  minWidth: 30,
  px: 0.75,
  py: 0.25,
  lineHeight: 1,
};

const sizeValueSx = {
  minWidth: 48,
  textAlign: 'center',
  fontFamily: 'monospace',
  fontSize: '0.75rem',
  color: 'text.primary',
};

function SizeGroup({
  label,
  value,
  disabled,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Button size="small" variant="outlined" sx={controlButtonSx} disabled={disabled} onClick={onDecrease}>
        -
      </Button>
      <Typography component="span" sx={sizeValueSx}>
        {value === null ? '--' : `${value}px`}
      </Typography>
      <Button size="small" variant="outlined" sx={controlButtonSx} disabled={disabled} onClick={onIncrease}>
        +
      </Button>
    </Box>
  );
}

const HeatmapSizeBar: React.FC<HeatmapSizeBarProps> = ({ toolbarState }) => {
  const disabled = !toolbarState || !toolbarState.canResize;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        px: 1.5,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: '#fafafa',
        minHeight: 42,
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          Heatmap Size
        </Typography>
        <Divider orientation="vertical" flexItem />
        <SizeGroup
          label="W"
          value={toolbarState?.currentColumnWidth ?? null}
          disabled={disabled}
          onDecrease={toolbarState?.decreaseColumnWidth ?? (() => undefined)}
          onIncrease={toolbarState?.increaseColumnWidth ?? (() => undefined)}
        />
        <SizeGroup
          label="H"
          value={toolbarState?.currentRowHeight ?? null}
          disabled={disabled}
          onDecrease={toolbarState?.decreaseRowHeight ?? (() => undefined)}
          onIncrease={toolbarState?.increaseRowHeight ?? (() => undefined)}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={disabled}
          onClick={toolbarState?.fitToView ?? (() => undefined)}
        >
          Fit to View
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!toolbarState?.hasOverrides}
          onClick={toolbarState?.reset ?? (() => undefined)}
        >
          Reset
        </Button>
      </Box>
    </Box>
  );
};

export default HeatmapSizeBar;