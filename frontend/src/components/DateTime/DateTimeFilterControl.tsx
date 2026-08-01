// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {
  TextField,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { DateTimeFilterMetadata } from '../../types';
import styles from './DateTimeFilterControl.module.css';

interface DateTimeFilterControlProps {
  metadata: DateTimeFilterMetadata;
  startDate: string | null;
  endDate: string | null;
  onChange: (startDate: string | null, endDate: string | null) => void;
}

const compactFieldSx = {
  '& .MuiInputBase-root': {
    minHeight: 0,
    height: 22,
    alignItems: 'flex-end',
  },
  '& .MuiInputBase-input': {
    fontSize: '0.75rem',
    lineHeight: 1.2,
    height: 'auto',
    py: 0,
    pb: '1px',
  },
  '& input[type="date"]::-webkit-datetime-edit': {
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  '& input[type="date"]::-webkit-calendar-picker-indicator': {
    margin: 0,
    padding: 0,
    width: 14,
    height: 14,
  },
  '& .MuiInput-underline:before': {
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
} as const;

const DateTimeFilterControl: React.FC<DateTimeFilterControlProps> = ({
  metadata,
  startDate,
  endDate,
  onChange,
}) => {
  const handleStartDateChange = (value: string) => {
    onChange(value || null, endDate);
  };

  const handleEndDateChange = (value: string) => {
    onChange(startDate, value || null);
  };

  if (metadata.loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ ml: 1, fontSize: '0.7rem' }}>
          Loading date range...
        </Typography>
      </Box>
    );
  }

  if (metadata.error) {
    return (
      <Box className={styles.container}>
        <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem' }}>
          Error: {metadata.error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={styles.container}>
      <Box className={styles.filterBox}>
        <Box className={styles.inputsContainer}>
          <Box className={styles.inputGroup}>
            <Typography component="label" variant="caption" className={styles.rowLabel}>
              Start
            </Typography>
            <TextField
              aria-label="Start date"
              type="date"
              size="small"
              variant="standard"
              value={startDate ? startDate.split('T')[0] : ''}
              onChange={(e) => handleStartDateChange(e.target.value)}
              inputProps={{
                min: metadata.min.split('T')[0],
                max: metadata.max.split('T')[0],
              }}
              className={styles.input}
              sx={compactFieldSx}
            />
          </Box>
          <Box className={styles.inputGroup}>
            <Typography component="label" variant="caption" className={styles.rowLabel}>
              End
            </Typography>
            <TextField
              aria-label="End date"
              type="date"
              size="small"
              variant="standard"
              value={endDate ? endDate.split('T')[0] : ''}
              onChange={(e) => handleEndDateChange(e.target.value)}
              inputProps={{
                min: metadata.min.split('T')[0],
                max: metadata.max.split('T')[0],
              }}
              className={styles.input}
              sx={compactFieldSx}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default DateTimeFilterControl;
