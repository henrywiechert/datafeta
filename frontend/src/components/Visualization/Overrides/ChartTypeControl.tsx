import React from 'react';
import { Box, IconButton, ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import BarChartIcon from '@mui/icons-material/BarChart';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import { UserChartType } from '../../../types';

interface ChartTypeControlProps {
  chartType: UserChartType | undefined;
  onChange: (chartType: UserChartType | undefined) => void;
  autoSelectedType?: UserChartType;
}

const ChartTypeControl: React.FC<ChartTypeControlProps> = ({
  chartType,
  onChange,
  autoSelectedType,
}) => {
  const handleChange = (_event: React.MouseEvent<HTMLElement>, newValue: string | null) => {
    if (newValue === 'auto' || newValue === null) {
      onChange(undefined);
    } else {
      onChange(newValue as UserChartType);
    }
  };

  // Current value: 'auto' when undefined, otherwise the chart type
  const value = chartType ?? 'auto';
  const isAuto = value === 'auto';

  const getAutoHighlightSx = (buttonValue: UserChartType) =>
    isAuto && autoSelectedType === buttonValue
      ? {
          boxShadow: 'inset 0 0 0 2px rgba(25, 118, 210, 0.9)',
        }
      : undefined;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      {/* Dense icon-only label (no click behavior yet) - OUTSIDE the framed selector */}
      <Tooltip title="Chart type" placement="top" arrow enterDelay={500} leaveDelay={100}>
        <IconButton size="small" sx={{ width: 28, height: 28 }} onClick={() => {}}>
          <InsertChartOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      {/* Framed selector */}
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          border: '1px solid rgba(0, 0, 0, 0.18)',
          borderRadius: '4px',
          backgroundColor: 'rgba(255,255,255,0.6)',
          overflow: 'hidden',
          width: 'fit-content',
          maxWidth: '100%',
        }}
      >
        <ToggleButtonGroup
          value={value}
          exclusive
          onChange={handleChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              padding: '2px 6px',
              minWidth: 28,
              height: 24,
              border: 'none',
              borderRadius: 0,
              '& + .MuiToggleButton-root': {
                borderLeft: '1px solid rgba(0, 0, 0, 0.12)',
              },
              '&.Mui-selected': {
                backgroundColor: 'primary.main',
                color: 'white',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
              },
            },
          }}
        >
          <ToggleButton value="auto" aria-label="auto-detect">
            <Tooltip title="Auto-detect chart type" placement="top">
              <AutoModeIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="line" aria-label="line chart" sx={getAutoHighlightSx('line')}>
            <Tooltip title="Line chart" placement="top">
              <ShowChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="scatter" aria-label="scatter plot" sx={getAutoHighlightSx('scatter')}>
            <Tooltip title="Scatter / Dot plot" placement="top">
              <ScatterPlotIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="tick" aria-label="tick strip" sx={getAutoHighlightSx('tick')}>
            <Tooltip title="Tick strip" placement="top">
              <LinearScaleIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="bar" aria-label="bar chart" sx={getAutoHighlightSx('bar')}>
            <Tooltip title="Bar chart" placement="top">
              <BarChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="gantt" aria-label="gantt chart" sx={getAutoHighlightSx('gantt')}>
            <Tooltip title="Gantt chart (interval)" placement="top">
              <ViewTimelineIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
};

export default ChartTypeControl;
