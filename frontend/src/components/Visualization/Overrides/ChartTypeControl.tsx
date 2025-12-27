import React from 'react';
import { Box, IconButton, ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import BarChartIcon from '@mui/icons-material/BarChart';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import { UserChartType } from '../../../types';

interface ChartTypeControlProps {
  chartType: UserChartType | undefined;
  onChange: (chartType: UserChartType | undefined) => void;
}

const ChartTypeControl: React.FC<ChartTypeControlProps> = ({
  chartType,
  onChange,
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

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 0.5, 
      mb: 0,
      p: 0.75,
      border: '1px solid #d0d0d0',
      borderRadius: '4px',
      backgroundColor: '#fafafa'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {/* Dense icon-only label (no click behavior yet) */}
        <IconButton size="small" sx={{ width: 28, height: 28 }} onClick={() => {}}>
          <InsertChartOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
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
              border: '1px solid rgba(0, 0, 0, 0.12)',
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
          <ToggleButton value="line" aria-label="line chart">
            <Tooltip title="Line chart" placement="top">
              <ShowChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="scatter" aria-label="scatter plot">
            <Tooltip title="Scatter / Dot plot" placement="top">
              <ScatterPlotIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="tick" aria-label="tick strip">
            <Tooltip title="Tick strip" placement="top">
              <LinearScaleIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="bar" aria-label="bar chart">
            <Tooltip title="Bar chart" placement="top">
              <BarChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
};

export default ChartTypeControl;
