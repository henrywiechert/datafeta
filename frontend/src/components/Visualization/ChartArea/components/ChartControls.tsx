import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  isDebugOpen,
  onToggleDebug,
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'flex-end',
      pt: 0.5,
      pb: 0.5,
      borderTop: isDebugOpen ? '1px solid #e0e0e0' : 'none',
      flexShrink: 0
    }}>
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