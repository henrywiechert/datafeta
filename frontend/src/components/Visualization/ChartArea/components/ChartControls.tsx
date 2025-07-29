import React from 'react';
import { Box, IconButton, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';

interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  isDebugOpen,
  onToggleDebug,
}) => {
  const { state: { chartingLibrary }, setChartingLibrary } = useVisualizationContext();

  const handleChartingLibraryChange = (
    event: React.MouseEvent<HTMLElement>,
    newLibrary: 'vega-lite' | 'vega' | 'observable-plot' | null,
  ) => {
    if (newLibrary !== null) {
      setChartingLibrary(newLibrary);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', // Changed to space-between
      pt: 0.5, // Reduced from 1 to 0.5
      pb: 0.5, // Added small bottom padding for balance
      borderTop: isDebugOpen ? '1px solid #e0e0e0' : 'none',
      flexShrink: 0 // Don't let controls shrink
    }}>
      <ToggleButtonGroup
        value={chartingLibrary}
        exclusive
        onChange={handleChartingLibraryChange}
        aria-label="charting library"
        size="small"
      >
        <ToggleButton value="vega-lite" aria-label="vega-lite">
          Vega-Lite
        </ToggleButton>
        <ToggleButton value="vega" aria-label="vega">
          Vega
        </ToggleButton>
        <ToggleButton value="observable-plot" aria-label="observable-plot">
          Observable Plot
        </ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton 
          onClick={onToggleDebug}
          size="small"
          color={isDebugOpen ? 'primary' : 'default'}
          sx={{ 
            backgroundColor: isDebugOpen ? 'primary.50' : 'transparent',
            '&:hover': {
              backgroundColor: isDebugOpen ? 'primary.100' : 'action.hover',
            }
          }}
        >
          <BugReportIcon fontSize="small" />
          {isDebugOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
          Debug
        </Typography>
      </Box>
    </Box>
  );
};

export default ChartControls; 