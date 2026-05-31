// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DateTimeRangeFilter Component
 * 
 * Advanced datetime range filter with millisecond precision.
 * Supports full datetime and timeline datetime parts.
 */

import React, { useState, useEffect } from 'react';
import {
  TextField,
  Box,
  Typography,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { DateTimeFilterMetadata } from '../../types';
import {
  parseISODateTime,
  formatISODateTime,
  validateMilliseconds,
  formatDateTimeForDisplay,
  DateTimeComponents,
} from '../../datetime';
import { getPresetsForField } from '../../datetime';
import styles from './DateTimeRangeFilter.module.css';

interface DateTimeRangeFilterProps {
  metadata: DateTimeFilterMetadata;
  startDateTime: string | null;
  endDateTime: string | null;
  dateTimePart?: string;  // For timeline parts (hour, day, month, etc.)
  onChange: (startDateTime: string | null, endDateTime: string | null) => void;
}

const DateTimeRangeFilter: React.FC<DateTimeRangeFilterProps> = ({
  metadata,
  startDateTime,
  endDateTime,
  dateTimePart,
  onChange,
}) => {
  // Parse initial values from backend (no timezone conversion)
  const [startComponents, setStartComponents] = useState<DateTimeComponents>(
    () => parseISODateTime(startDateTime) || parseISODateTime(metadata.min) || {
      date: '',
      time: '00:00:00',
      milliseconds: '000',
    }
  );
  
  const [endComponents, setEndComponents] = useState<DateTimeComponents>(
    () => parseISODateTime(endDateTime) || parseISODateTime(metadata.max) || {
      date: '',
      time: '23:59:59',
      milliseconds: '999',
    }
  );
  
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  
  // Get appropriate presets for this field type
  const presets = getPresetsForField(dateTimePart);
  
  // Sync internal state when external props change (e.g., zoom filter, undo/redo)
  // Intentionally omit startComponents/endComponents from deps to avoid feedback loops
  useEffect(() => {
    const incoming = parseISODateTime(startDateTime);
    if (incoming) {
      setStartComponents(prev =>
        prev.date === incoming.date && prev.time === incoming.time && prev.milliseconds === incoming.milliseconds
          ? prev
          : incoming
      );
    }
    // REASON: only sync internal components when the external ISO string changes; setStartComponents is stable from useState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateTime]);

  useEffect(() => {
    const incoming = parseISODateTime(endDateTime);
    if (incoming) {
      setEndComponents(prev =>
        prev.date === incoming.date && prev.time === incoming.time && prev.milliseconds === incoming.milliseconds
          ? prev
          : incoming
      );
    }
    // REASON: mirrors the startDateTime effect — sync only on external value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDateTime]);

  // Update parent when components change
  useEffect(() => {
    if (startComponents.date && endComponents.date) {
      const start = formatISODateTime(startComponents);
      const end = formatISODateTime(endComponents);
      onChange(start, end);
    }
    // REASON: onChange may be a new closure each render; including it would fire onChange on every parent render, causing a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startComponents, endComponents]);
  
  const handleStartDateChange = (value: string) => {
    setStartComponents(prev => ({ ...prev, date: value }));
    setSelectedPreset('custom');
  };
  
  const handleStartTimeChange = (value: string) => {
    setStartComponents(prev => ({ ...prev, time: value }));
    setSelectedPreset('custom');
  };
  
  const handleStartMillisecondsChange = (value: string) => {
    const validated = validateMilliseconds(value);
    setStartComponents(prev => ({ ...prev, milliseconds: validated }));
    setSelectedPreset('custom');
  };
  
  const handleEndDateChange = (value: string) => {
    setEndComponents(prev => ({ ...prev, date: value }));
    setSelectedPreset('custom');
  };
  
  const handleEndTimeChange = (value: string) => {
    setEndComponents(prev => ({ ...prev, time: value }));
    setSelectedPreset('custom');
  };
  
  const handleEndMillisecondsChange = (value: string) => {
    const validated = validateMilliseconds(value);
    setEndComponents(prev => ({ ...prev, milliseconds: validated }));
    setSelectedPreset('custom');
  };
  
  const handlePresetChange = (presetLabel: string) => {
    setSelectedPreset(presetLabel);
    
    if (presetLabel === 'custom') return;
    
    const preset = presets.find(p => p.label === presetLabel);
    if (!preset) return;
    
    const { start, end } = preset.getValue(new Date(), metadata.min, metadata.max);
    
    const startParsed = parseISODateTime(start);
    const endParsed = parseISODateTime(end);
    
    if (startParsed) setStartComponents(startParsed);
    if (endParsed) setEndComponents(endParsed);
  };
  
  if (metadata.loading) {
    return (
      <Box className={styles.container}>
        <CircularProgress size={20} />
        <Typography variant="caption" sx={{ ml: 1 }}>
          Loading datetime range...
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
  
  const fieldLabel = dateTimePart 
    ? `${dateTimePart.charAt(0).toUpperCase() + dateTimePart.slice(1)} (Timeline)`
    : 'DateTime';
  
  return (
    <Box className={styles.container}>
      {/* Available range info */}
      <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>
        Available {fieldLabel}: {formatDateTimeForDisplay(metadata.min)} to {formatDateTimeForDisplay(metadata.max)}
      </Typography>
      
      {/* Quick Presets */}
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>Quick Presets</InputLabel>
        <Select
          value={selectedPreset}
          label="Quick Presets"
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          <MenuItem value="custom">Custom Range</MenuItem>
          {presets.map((preset) => (
            <MenuItem key={preset.label} value={preset.label}>
              {preset.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      {/* Start DateTime */}
      <Box className={styles.dateTimeRow}>
        <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
          Start:
        </Typography>
        <Box className={styles.inputsContainer}>
          <TextField
            label="Date"
            type="date"
            size="small"
            value={startComponents.date}
            onChange={(e) => handleStartDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              min: metadata.min ? parseISODateTime(metadata.min)?.date : undefined,
              max: metadata.max ? parseISODateTime(metadata.max)?.date : undefined,
            }}
            className={styles.dateInput}
          />
          <TextField
            label="Time"
            type="time"
            size="small"
            value={startComponents.time}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: "1" }} // Enable seconds
            className={styles.timeInput}
          />
          <TextField
            label="Ms"
            type="number"
            size="small"
            value={startComponents.milliseconds}
            onChange={(e) => handleStartMillisecondsChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: 0, max: 999, step: 1 }}
            className={styles.msInput}
          />
        </Box>
      </Box>
      
      {/* End DateTime */}
      <Box className={styles.dateTimeRow}>
        <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
          End:
        </Typography>
        <Box className={styles.inputsContainer}>
          <TextField
            label="Date"
            type="date"
            size="small"
            value={endComponents.date}
            onChange={(e) => handleEndDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              min: metadata.min ? parseISODateTime(metadata.min)?.date : undefined,
              max: metadata.max ? parseISODateTime(metadata.max)?.date : undefined,
            }}
            className={styles.dateInput}
          />
          <TextField
            label="Time"
            type="time"
            size="small"
            value={endComponents.time}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: "1" }} // Enable seconds
            className={styles.timeInput}
          />
          <TextField
            label="Ms"
            type="number"
            size="small"
            value={endComponents.milliseconds}
            onChange={(e) => handleEndMillisecondsChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: 0, max: 999, step: 1 }}
            className={styles.msInput}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default DateTimeRangeFilter;

