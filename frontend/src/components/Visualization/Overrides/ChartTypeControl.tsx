// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, IconButton, Menu, MenuItem, ToggleButtonGroup, ToggleButton, Tooltip } from '@mui/material';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import BarChartIcon from '@mui/icons-material/BarChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import GridOnIcon from '@mui/icons-material/GridOn';
import PublicIcon from '@mui/icons-material/Public';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon';
import { DistributionVariant, LineVariant, MapExtentMode, TableCellMode, UserChartType } from '../../../types';

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

const DensityIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      d="M3 20 C 5 20, 6 18, 8 14 S 12 4, 14 4 S 18 14, 20 18 C 21 20, 22 20, 24 20"
      fill="currentColor"
      opacity="0.35"
    />
    <path
      d="M3 20 C 5 20, 6 18, 8 14 S 12 4, 14 4 S 18 14, 20 18 C 21 20, 22 20, 24 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

const AreaChartIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path
      d="M3 18 L3 15 C 6 15, 7 13, 9 11 C 11 9, 13 10, 15 7 C 17 4, 19 5, 21 3 L21 18 Z"
      fill="currentColor"
      opacity="0.32"
    />
    <path
      d="M3 15 C 6 15, 7 13, 9 11 C 11 9, 13 10, 15 7 C 17 4, 19 5, 21 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </SvgIcon>
);

/**
 * Visual prefix used in tooltips of chart types still under active development
 * (currently Table and Heatmap). Keeps the wording consistent across buttons.
 */
const ExperimentalBadge: React.FC = () => (
  <Box component="span" sx={{ color: '#ffb74d', fontWeight: 700 }}>
    EXPERIMENTAL
  </Box>
);

interface ChartTypeControlProps {
  chartType: UserChartType | undefined;
  onChange: (chartType: UserChartType | undefined) => void;
  autoSelectedType?: UserChartType;
  lineVariant?: LineVariant;
  onLineVariantChange?: (variant: LineVariant) => void;
  distributionVariant?: DistributionVariant;
  onDistributionVariantChange?: (variant: DistributionVariant) => void;
  /** Cell rendering mode for the 'table-refactor' chart type. */
  tableCellMode?: TableCellMode;
  /** Called when the user picks a different cell mode from the table popover. */
  onTableCellModeChange?: (mode: TableCellMode) => void;
  /** Map extent when globalChartType is 'map'. */
  mapExtentMode?: MapExtentMode;
  /** Called when the user picks data vs world extent from the map popover. */
  onMapExtentModeChange?: (mode: MapExtentMode) => void;
}

const ChartTypeControl: React.FC<ChartTypeControlProps> = ({
  chartType,
  onChange,
  autoSelectedType,
  lineVariant = 'line',
  onLineVariantChange,
  distributionVariant = 'tick-strip',
  onDistributionVariantChange,
  tableCellMode = 'auto',
  onTableCellModeChange,
  mapExtentMode = 'data',
  onMapExtentModeChange,
}) => {
  const [distributionMenuAnchor, setDistributionMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [tableModeMenuAnchor, setTableModeMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [mapExtentMenuAnchor, setMapExtentMenuAnchor] = React.useState<HTMLElement | null>(null);

  const handleChange = (_event: React.MouseEvent<HTMLElement>, newValue: string | null) => {
    if (newValue === 'auto' || newValue === null) {
      onChange(undefined);
    } else if (newValue === 'area') {
      onLineVariantChange?.('area');
      onChange('line');
    } else if (newValue === 'line') {
      onLineVariantChange?.('line');
      onChange('line');
    } else {
      onChange(newValue as UserChartType);
    }
  };

  // Current value: 'auto' when undefined, otherwise the chart type
  const value = chartType === 'line' && lineVariant === 'area' ? 'area' : (chartType ?? 'auto');
  const isAuto = value === 'auto';
  const effectiveDistributionSelected = value === 'tick' || (isAuto && autoSelectedType === 'tick');
  const effectiveTableSelected = value === 'table-refactor' || (isAuto && autoSelectedType === 'table-refactor');
  const effectiveMapSelected = value === 'map' || (isAuto && autoSelectedType === 'map');

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

  const openTableModeMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTableModeMenuAnchor(event.currentTarget);
  };

  const closeTableModeMenu = () => {
    setTableModeMenuAnchor(null);
  };

  const handleTableCellModeSelect = (mode: TableCellMode) => {
    onTableCellModeChange?.(mode);
    closeTableModeMenu();
  };

  const openMapExtentMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMapExtentMenuAnchor(event.currentTarget);
  };

  const closeMapExtentMenu = () => {
    setMapExtentMenuAnchor(null);
  };

  const handleMapExtentModeSelect = (mode: MapExtentMode) => {
    onMapExtentModeChange?.(mode);
    closeMapExtentMenu();
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
          <ToggleButton value="area" aria-label="area chart" sx={getAutoHighlightSx('line')}>
            <Tooltip title={<>Area Chart<br/>Line chart variant with filled baseline area</>} placement="top">
              <AreaChartIcon sx={{ fontSize: 16 }} />
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
          <ToggleButton value="pie" aria-label="pie chart" sx={getAutoHighlightSx('pie')}>
            <Tooltip
              title={(
                <>
                  <ExperimentalBadge /><br/>
                  Pie chart<br/>
                  Discrete <b>Color</b> defines slices
                </>
              )}
              placement="top"
            >
              <PieChartIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="cdf" aria-label="CDF chart" sx={getAutoHighlightSx('cdf')}>
            <Tooltip title={<>CDF (cumulative distribution function)<br/>Needs a Measure on <b>X</b></>} placement="top">
              <span style={{ display: 'inline-flex' }}><CdfIcon sx={{ fontSize: 16 }} /></span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="density" aria-label="density chart" sx={getAutoHighlightSx('density')}>
            <Tooltip title={<>Density (KDE)<br/>Continuous field on <b>X</b>, raw rows</>} placement="top">
              <span style={{ display: 'inline-flex' }}><DensityIcon sx={{ fontSize: 16 }} /></span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="heatmap" aria-label="heatmap chart" sx={getAutoHighlightSx('heatmap')}>
            <Tooltip
              title={(
                <>
                  <ExperimentalBadge /><br/>
                  Heatmap<br/>
                  Discrete dimensions on <b>X</b> and <b>Y</b>, measure on <b>Color</b>.
                </>
              )}
              placement="top"
            >
              <GridOnIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="map" aria-label="map chart" sx={getAutoHighlightSx('map')}>
            <Tooltip
              title={(
                <>
                  <ExperimentalBadge /><br/>
                  Map<br/>
                  Longitude on <b>X</b>, latitude on <b>Y</b>.<br/>
                  Open the menu to pick <b>Fit to data</b> or <b>Full world</b>.
                </>
              )}
              placement="top"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                <PublicIcon sx={{ fontSize: 16 }} />
                {onMapExtentModeChange && (
                  <span
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={openMapExtentMenu}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: 1,
                      opacity: effectiveMapSelected ? 0.95 : 0.7,
                    }}
                  >
                    <ArrowDropDownIcon sx={{ fontSize: 12 }} />
                  </span>
                )}
              </span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="table-refactor" aria-label="table" sx={getAutoHighlightSx('table-refactor')}>
            <Tooltip
              title={(
                <>
                  <ExperimentalBadge /><br/>
                  Table<br/>
                  Discrete dimensions on <b>X</b>/<b>Y</b> form a Tableau-style grid.<br/>
                  Open the menu to pick <b>Auto</b> / <b>Text</b> / <b>Symbol</b> cells.
                </>
              )}
              placement="top"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                <TableChartIcon sx={{ fontSize: 16 }} />
                {onTableCellModeChange && (
                  <span
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={openTableModeMenu}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: 1,
                      opacity: effectiveTableSelected ? 0.95 : 0.7,
                    }}
                  >
                    <ArrowDropDownIcon sx={{ fontSize: 12 }} />
                  </span>
                )}
              </span>
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
        <Menu
          anchorEl={tableModeMenuAnchor}
          open={Boolean(tableModeMenuAnchor)}
          onClose={closeTableModeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          MenuListProps={{ dense: true, 'aria-label': 'Table cell modes' }}
        >
          <MenuItem
            selected={tableCellMode === 'auto'}
            onClick={() => handleTableCellModeSelect('auto')}
          >
            Auto
          </MenuItem>
          <MenuItem
            selected={tableCellMode === 'text'}
            onClick={() => handleTableCellModeSelect('text')}
          >
            Text
          </MenuItem>
          <MenuItem
            selected={tableCellMode === 'symbol'}
            onClick={() => handleTableCellModeSelect('symbol')}
          >
            Symbol
          </MenuItem>
        </Menu>
        <Menu
          anchorEl={mapExtentMenuAnchor}
          open={Boolean(mapExtentMenuAnchor)}
          onClose={closeMapExtentMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
          MenuListProps={{ dense: true, 'aria-label': 'Map extent modes' }}
        >
          <MenuItem
            selected={mapExtentMode === 'data'}
            onClick={() => handleMapExtentModeSelect('data')}
          >
            Fit to data
          </MenuItem>
          <MenuItem
            selected={mapExtentMode === 'world'}
            onClick={() => handleMapExtentModeSelect('world')}
          >
            Full world
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
};

export default ChartTypeControl;
