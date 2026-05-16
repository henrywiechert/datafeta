// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { 
  TextField, 
  Box, 
  Typography,
  CircularProgress
} from '@mui/material';
import { DateTimeFilterMetadata } from '../../types';
import styles from './DateTimeFilterControl.module.css';

interface DateTimeFilterControlProps {
  metadata: DateTimeFilterMetadata;
  startDate: string | null;
  endDate: string | null;
  onChange: (startDate: string | null, endDate: string | null) => void;
}

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

  // Format date for display (simplified)
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  if (metadata.loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={20} />
        <Typography variant="caption" sx={{ ml: 1 }}>
          Loading date range...
        </Typography>
      </Box>
    );
  }

  if (metadata.error) {
    return (
      <Box className={styles.container}>
        <Typography variant="caption" color="error">
          Error: {metadata.error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={styles.container}>
      {/* Range info */}
      <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>
        Available range: {formatDate(metadata.min)} - {formatDate(metadata.max)}
      </Typography>

      {/* Date input fields */}
      <Box className={styles.inputsContainer}>
        <TextField
          label="Start Date"
          type="date"
          size="small"
          value={startDate ? startDate.split('T')[0] : ''}
          onChange={(e) => handleStartDateChange(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
          inputProps={{
            min: metadata.min.split('T')[0],
            max: metadata.max.split('T')[0],
          }}
          className={styles.input}
        />
        <TextField
          label="End Date"
          type="date"
          size="small"
          value={endDate ? endDate.split('T')[0] : ''}
          onChange={(e) => handleEndDateChange(e.target.value)}
          InputLabelProps={{
            shrink: true,
          }}
          inputProps={{
            min: metadata.min.split('T')[0],
            max: metadata.max.split('T')[0],
          }}
          className={styles.input}
        />
      </Box>
    </Box>
  );
};

export default DateTimeFilterControl;


