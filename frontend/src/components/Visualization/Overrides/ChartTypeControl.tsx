import React from 'react';
import { Box, IconButton, Menu, MenuItem, ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import BarChartIcon from '@mui/icons-material/BarChart';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon';
import { DistributionVariant, UserChartType } from '../../../types';

const TickStripIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    {/* Row 1: dense left, loose right */}
    <line x1="2"  y1="4" x2="2"  y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6"  y1="4" x2="6"  y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8"  y1="4" x2="8"  y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="4" x2="10" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="15" y1="4" x2="15" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="4" x2="20" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    {/* Row 2: loose left, dense right (mirror) */}
    <line x1="4"  y1="15" x2="4"  y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="9"  y1="15" x2="9"  y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="15" x2="14" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="16" y1="15" x2="16" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="18" y1="15" x2="18" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="15" x2="20" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="22" y1="15" x2="22" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </SvgIcon>
);

const GanttIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    {/* Lane 1: two bars with a gap in the middle */}
    <rect x="2"  y="4"  width="8"  height="4" rx="1" fill="currentColor" />
    <rect x="14" y="4"  width="8"  height="4" rx="1" fill="currentColor" />
    {/* Lane 2: ~2/3 width, left aligned */}
    <rect x="2"  y="10" width="13" height="4" rx="1" fill="currentColor" />
    {/* Lane 3: ~2/3 width, right aligned */}
    <rect x="9"  y="16" width="13" height="4" rx="1" fill="currentColor" />
  </SvgIcon>
);

const CdfIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      d="M3 20 C 6 20, 8 20, 10 16 S 14 4, 17 4 C 18 4, 20 4, 21 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </SvgIcon>
);

const BoxPlotIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="8" y="8" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" rx="1" />
    <line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6" y1="10" x2="6" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="18" y1="10" x2="18" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </SvgIcon>
);

interface ChartTypeControlProps {
  chartType: UserChartType | undefined;
  onChange: (chartType: UserChartType | undefined) => void;
  autoSelectedType?: UserChartType;
  distributionVariant?: DistributionVariant;
  onDistributionVariantChange?: (variant: DistributionVariant) => void;
}

const ChartTypeControl: React.FC<ChartTypeControlProps> = ({
  chartType,
  onChange,
  autoSelectedType,
  distributionVariant = 'tick-strip',
  onDistributionVariantChange,
}) => {
  const [distributionMenuAnchor, setDistributionMenuAnchor] = React.useState<HTMLElement | null>(null);

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
  const effectiveDistributionSelected = value === 'tick' || (isAuto && autoSelectedType === 'tick');

  const openDistributionMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDistributionMenuAnchor(event.currentTarget);
  };

  const closeDistributionMenu = () => {
    setDistributionMenuAnchor(null);
  };

  const handleDistributionVariantSelect = (variant: DistributionVariant) => {
    onDistributionVariantChange?.(variant);
    closeDistributionMenu();
  };

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
          minWidth: 0,
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
            flexWrap: 'wrap',
            maxWidth: '100%',
            '& .MuiToggleButton-root': {
              padding: '2px 6px',
              minWidth: 28,
              height: 24,
              border: '1px solid rgba(0, 0, 0, 0.14)',
              borderRadius: 0,
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
            <Tooltip title={<>Line Chart<br/>Dimension on <b>X</b> and Measure on <b>Y</b></>} placement="top">
              <ShowChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="scatter" aria-label="scatter plot" sx={getAutoHighlightSx('scatter')}>
            <Tooltip title={<>Scatter Chart<br/>Dimensions on <b>X</b> and <b>Y</b></>} placement="top">
              <ScatterPlotIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="tick" aria-label="distribution chart" sx={getAutoHighlightSx('tick')}>
            <Tooltip title={<>Distribution<br/>Tick-Strip or Box-Plot for a continuous dimension</>} placement="top">
              <span style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                {distributionVariant === 'box-plot'
                  ? <BoxPlotIcon sx={{ fontSize: 16 }} />
                  : <TickStripIcon sx={{ fontSize: 16 }} />}
                {onDistributionVariantChange && (
                  <span
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={openDistributionMenu}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: 1,
                      opacity: effectiveDistributionSelected ? 0.95 : 0.7,
                    }}
                  >
                    <ArrowDropDownIcon sx={{ fontSize: 12 }} />
                  </span>
                )}
              </span>
            </Tooltip>
          </ToggleButton>
            <ToggleButton value="bar" aria-label="bar chart" sx={getAutoHighlightSx('bar')}>
            <Tooltip title={<>Bar chart<br/>Category on <b>X</b>, Measure on <b>Y</b></>} placement="top">
              <BarChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="gantt" aria-label="gantt chart" sx={getAutoHighlightSx('gantt')}>
            <Tooltip title={<>Gantt chart<br/>Start on <b>X</b>, length on <b>Size</b></>} placement="top">
              <span style={{ display: 'inline-flex' }}><GanttIcon sx={{ fontSize: 16 }} /></span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="cdf" aria-label="CDF chart" sx={getAutoHighlightSx('cdf')}>
            <Tooltip title={<>CDF (cumulative distribution function)<br/>Needs a Measure on <b>X</b></>} placement="top">
              <span style={{ display: 'inline-flex' }}><CdfIcon sx={{ fontSize: 16 }} /></span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
        <Menu
          anchorEl={distributionMenuAnchor}
          open={Boolean(distributionMenuAnchor)}
          onClose={closeDistributionMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          MenuListProps={{ dense: true, 'aria-label': 'Distribution variants' }}
        >
          <MenuItem
            selected={distributionVariant === 'tick-strip'}
            onClick={() => handleDistributionVariantSelect('tick-strip')}
          >
            Tick-Strip
          </MenuItem>
          <MenuItem
            selected={distributionVariant === 'box-plot'}
            onClick={() => handleDistributionVariantSelect('box-plot')}
          >
            Box-Plot
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
};

export default ChartTypeControl;
