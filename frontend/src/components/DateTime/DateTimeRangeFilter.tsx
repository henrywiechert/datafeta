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
} from '@mui/material';
import { DateTimeFilterMetadata } from '../../types';
import {
  parseISODateTime,
  formatISODateTime,
  validateMilliseconds,
  DateTimeComponents,
} from '../../datetime';
import { getPresetsForField } from '../../datetime';
import styles from './DateTimeRangeFilter.module.css';

interface DateTimeRangeFilterProps {
  metadata: DateTimeFilterMetadata;
  startDateTime: string | null;
  endDateTime: string | null;
  dateTimePart?: string; // For timeline parts (hour, day, month, etc.)
  onChange: (startDateTime: string | null, endDateTime: string | null) => void;
}

const compactFieldSx = {
  '& .MuiInputBase-root': {
    minHeight: 0,
    height: 22,
    alignItems: 'flex-end',
    width: 'fit-content',
    maxWidth: '100%',
  },
  '& .MuiInputBase-input': {
    fontSize: '0.75rem',
    lineHeight: 1.2,
    height: 'auto',
    py: 0,
    pb: '1px',
    width: 'auto',
    // Keep native date/time controls from inventing a large default width
    minWidth: 0,
    fieldSizing: 'content',
  },
  // Safari/WebKit date+time: drop internal padding so value sits on the underline
  '& input[type="date"]::-webkit-datetime-edit, & input[type="time"]::-webkit-datetime-edit': {
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  '& input[type="date"]::-webkit-calendar-picker-indicator, & input[type="time"]::-webkit-calendar-picker-indicator': {
    margin: 0,
    marginLeft: '2px',
    padding: 0,
    width: 14,
    height: 14,
  },
  '& .MuiInput-underline:before': {
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
} as const;

/** Build `HH:mm:ss.sss` for <input type="time" step="0.001">. */
function toTimeInputValue(time: string, milliseconds: string): string {
  const base = time.split(':').length === 2 ? `${time}:00` : time || '00:00:00';
  return `${base}.${validateMilliseconds(milliseconds)}`;
}

/** Parse time input value (may be HH:mm, HH:mm:ss, or HH:mm:ss.sss). */
function fromTimeInputValue(value: string): Pick<DateTimeComponents, 'time' | 'milliseconds'> {
  if (!value) {
    return { time: '00:00:00', milliseconds: '000' };
  }
  const [timePart, msPart] = value.split('.');
  const time = timePart.split(':').length === 2 ? `${timePart}:00` : timePart;
  return {
    time,
    milliseconds: validateMilliseconds(msPart ?? '000'),
  };
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
    const { time, milliseconds } = fromTimeInputValue(value);
    setStartComponents(prev => ({ ...prev, time, milliseconds }));
    setSelectedPreset('custom');
  };

  const handleEndDateChange = (value: string) => {
    setEndComponents(prev => ({ ...prev, date: value }));
    setSelectedPreset('custom');
  };

  const handleEndTimeChange = (value: string) => {
    const { time, milliseconds } = fromTimeInputValue(value);
    setEndComponents(prev => ({ ...prev, time, milliseconds }));
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
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ ml: 1, fontSize: '0.7rem' }}>
          Loading datetime range...
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

  const minDate = metadata.min ? parseISODateTime(metadata.min)?.date : undefined;
  const maxDate = metadata.max ? parseISODateTime(metadata.max)?.date : undefined;

  return (
    <Box className={styles.container}>
      <Box className={styles.filterBox}>
        <Box className={styles.presetRow}>
          <Typography component="label" variant="caption" className={styles.rowLabel} htmlFor="datetime-preset">
            Preset
          </Typography>
          <FormControl size="small" variant="standard" className={styles.presetSelect}>
            <Select
              id="datetime-preset"
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              disableUnderline
              sx={{
                fontSize: '0.75rem',
                '& .MuiSelect-select': { py: 0.25, pr: '24px !important' },
              }}
              MenuProps={{
                MenuListProps: { dense: true },
                PaperProps: {
                  sx: {
                    '& .MuiMenuItem-root': { fontSize: '0.75rem', minHeight: 28, py: 0.5 },
                  },
                },
              }}
            >
              <MenuItem dense value="custom">
                Custom range
              </MenuItem>
              {presets.map((preset) => (
                <MenuItem dense key={preset.label} value={preset.label}>
                  {preset.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box className={styles.dateTimeRow}>
          <Typography component="label" variant="caption" className={styles.rowLabel}>
            Start
          </Typography>
          <Box className={styles.inputsContainer}>
            <TextField
              aria-label="Start date"
              type="date"
              size="small"
              variant="standard"
              value={startComponents.date}
              onChange={(e) => handleStartDateChange(e.target.value)}
              inputProps={{ min: minDate, max: maxDate }}
              className={styles.dateInput}
              sx={compactFieldSx}
            />
            <TextField
              aria-label="Start time"
              type="time"
              size="small"
              variant="standard"
              value={toTimeInputValue(startComponents.time, startComponents.milliseconds)}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              inputProps={{ step: '0.001' }}
              className={styles.timeInput}
              sx={compactFieldSx}
            />
          </Box>
        </Box>

        <Box className={styles.dateTimeRow}>
          <Typography component="label" variant="caption" className={styles.rowLabel}>
            End
          </Typography>
          <Box className={styles.inputsContainer}>
            <TextField
              aria-label="End date"
              type="date"
              size="small"
              variant="standard"
              value={endComponents.date}
              onChange={(e) => handleEndDateChange(e.target.value)}
              inputProps={{ min: minDate, max: maxDate }}
              className={styles.dateInput}
              sx={compactFieldSx}
            />
            <TextField
              aria-label="End time"
              type="time"
              size="small"
              variant="standard"
              value={toTimeInputValue(endComponents.time, endComponents.milliseconds)}
              onChange={(e) => handleEndTimeChange(e.target.value)}
              inputProps={{ step: '0.001' }}
              className={styles.timeInput}
              sx={compactFieldSx}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default DateTimeRangeFilter;
