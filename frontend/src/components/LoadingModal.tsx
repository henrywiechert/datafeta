import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Button,
  Box,
  CircularProgress,
  Typography,
  LinearProgress,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { LoadingOperationType } from '../contexts/VisualizationContext';

interface LoadingModalProps {
  open: boolean;
  operationType: LoadingOperationType | null;
  canCancel: boolean;
  startTime: number | null;
  onCancel: () => void;
}

const getOperationMessage = (operationType: LoadingOperationType | null): string => {
  switch (operationType) {
    case 'query':
      return 'Executing query...';
    case 'rendering':
      return 'Rendering chart...';
    case 'metadata':
      return 'Loading metadata...';
    default:
      return 'Processing...';
  }
};

const getOperationDescription = (operationType: LoadingOperationType | null): string => {
  switch (operationType) {
    case 'query':
      return 'Large datasets may require more time to process. You can cancel this operation if needed.';
    case 'rendering':
      return 'Complex visualizations with many data points may take time to render. Consider using aggregation for better performance.';
    case 'metadata':
      return 'Connecting to the data source and retrieving metadata information.';
    default:
      return 'This operation is taking longer than expected. You can cancel if needed.';
  }
};

export const LoadingModal: React.FC<LoadingModalProps> = ({
  open,
  operationType,
  canCancel,
  startTime,
  onCancel,
}) => {
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!open || !startTime) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [open, startTime]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog
      open={open}
      disableEscapeKeyDown
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: '200px',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" component="span">
          {getOperationMessage(operationType)}
        </Typography>
        {canCancel && (
          <IconButton
            onClick={onCancel}
            size="small"
            sx={{ ml: 1 }}
            aria-label="Cancel operation"
          >
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {/* Progress Indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary">
              {formatTime(elapsedTime)}
            </Typography>
          </Box>

          {/* Linear Progress Bar */}
          <Box sx={{ width: '100%' }}>
            <LinearProgress 
              variant="indeterminate" 
              sx={{ 
                height: 4, 
                borderRadius: 2,
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 2,
                }
              }} 
            />
          </Box>

          {/* Description */}
          <Typography 
            variant="body2" 
            color="text.secondary" 
            textAlign="center"
            sx={{ maxWidth: '400px' }}
          >
            {getOperationDescription(operationType)}
          </Typography>
        </Box>
      </DialogContent>

      {canCancel && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={onCancel}
            variant="outlined"
            color="secondary"
            startIcon={<CloseIcon />}
          >
            Cancel
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default LoadingModal; 