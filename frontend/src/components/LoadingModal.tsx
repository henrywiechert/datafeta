// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
  operationType: LoadingOperationType | null; // legacy primary
  canCancel: boolean;
  startTime: number | null; // legacy start time
  onCancel: () => void;
  // New multi-operation props (optional for backward compatibility)
  activeOperations?: LoadingOperationType[];
  modalPrimaryOperation?: LoadingOperationType | null;
  operationStartTimes?: Record<LoadingOperationType, number | null>;
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

// LoadingModal now supports multi-operation display. Legacy props (operationType, startTime) are still
// accepted for backward compatibility; if multi-operation props are provided we prefer modalPrimaryOperation.
export const LoadingModal: React.FC<LoadingModalProps> = ({
  open,
  operationType,
  canCancel,
  startTime,
  onCancel,
  activeOperations = [],
  modalPrimaryOperation = null,
  operationStartTimes = { query: null, rendering: null, metadata: null }
}) => {
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Update elapsed time every second
  // Determine which start time to use: prefer new primary operation
  // Choose primary: new multi-op primary first, fallback to legacy single operation type
  const effectivePrimary = modalPrimaryOperation || operationType;
  const primaryStart = effectivePrimary ? operationStartTimes[effectivePrimary] : startTime;

  useEffect(() => {
    if (!open || !primaryStart) {
      setElapsedTime(0);
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - primaryStart) / 1000);
      setElapsedTime(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [open, primaryStart]);

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
      aria-labelledby="loading-modal-title"
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: '200px',
        },
      }}
    >
      <DialogTitle
        id="loading-modal-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}
      >
        <Typography variant="h6" component="span" role="status" aria-live="polite">
          {getOperationMessage(effectivePrimary)}
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
            {getOperationDescription(effectivePrimary)}
          </Typography>
          {activeOperations.length > 1 && (
            <Box sx={{ mt: 1, width: '100%' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Other active operations:
              </Typography>
              <Box component="ul" sx={{ pl: 2, mt: 0.5, mb: 0, listStyle: 'disc' }}>
                {activeOperations.filter(op => op !== effectivePrimary).map(op => {
                  const st = operationStartTimes[op];
                  const secs = st ? Math.floor((Date.now() - st) / 1000) : 0;
                  return (
                    <li key={op} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                      {getOperationMessage(op)} – {formatTime(secs)}
                    </li>
                  );
                })}
              </Box>
            </Box>
          )}
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