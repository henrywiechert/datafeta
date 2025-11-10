import React from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';

interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isFullscreenSupported?: boolean;
}

const ChartControls: React.FC<ChartControlsProps> = ({
  isDebugOpen,
  onToggleDebug,
  isFullscreen = false,
  onToggleFullscreen,
  isFullscreenSupported = true,
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      pt: 0.5,
      pb: 0.5,
      px: 1,
      borderTop: isDebugOpen ? '1px solid #e0e0e0' : 'none',
      flexShrink: 0
    }}>
      {/* Left side - Fullscreen button */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {isFullscreenSupported && onToggleFullscreen && (
          <>
            <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
              <IconButton 
                onClick={onToggleFullscreen}
                size="small"
                color={isFullscreen ? 'primary' : 'default'}
                sx={{ 
                  backgroundColor: isFullscreen ? 'primary.50' : 'transparent',
                  '&:hover': {
                    backgroundColor: isFullscreen ? 'primary.100' : 'action.hover',
                  }
                }}
              >
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
              Fullscreen
            </Typography>
          </>
        )}
      </Box>

      {/* Right side - Debug button */}
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