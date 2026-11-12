// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * InfluxDB connection form state and its conversions (validation, connect
 * details, restore from saved details). Kept together so useConnectionForm
 * only delegates.
 */

import type {
  ConnectionDetails,
  InfluxAuthMode,
  InfluxMeasurement,
  InfluxServerRequest,
  InfluxTimeMode,
} from '../../types';
import type { ValidationResult } from './types';

export interface InfluxDbFormState {
  url: string;
  auth: InfluxAuthMode;
  username: string;
  password: string;
  token: string;
  verifySsl: boolean;
  database: string;
  /** Discovered with "List databases"; empty until then. */
  databases: string[];
  serverVersion: string | null;
  /** Discovered with "Load measurements"; empty until then. */
  measurements: InfluxMeasurement[];
  selectedMeasurements: string[];
  timeMode: InfluxTimeMode;
  last: string; // e.g. '7d'
  start: string; // datetime-local value, read as UTC
  end: string;
}

export const DEFAULT_INFLUXDB_STATE: InfluxDbFormState = {
  url: 'http://localhost:8086',
  auth: 'none',
  username: '',
  password: '',
  token: '',
  verifySsl: true,
  database: '',
  databases: [],
  serverVersion: null,
  measurements: [],
  selectedMeasurements: [],
  timeMode: 'last',
  last: '7d',
  start: '',
  end: '',
};

const DURATION_RE = /^[1-9]\d*(s|m|h|d|w)$/;

/** The server part of a request, with only the credentials the auth mode uses. */
export function influxServerRequest(state: InfluxDbFormState): InfluxServerRequest {
  const request: InfluxServerRequest = {
    influx_url: state.url.trim(),
    influx_auth: state.auth,
    influx_verify_ssl: state.verifySsl,
  };
  if (state.auth === 'basic') {
    request.influx_username = state.username;
    request.influx_password = state.password;
  } else if (state.auth === 'token') {
    request.influx_token = state.token;
  }
  return request;
}

/** Problems that block talking to the server at all (discovery and connect). */
export function validateInfluxServer(state: InfluxDbFormState): string | null {
  if (!/^https?:\/\/\S+/.test(state.url.trim())) {
    return 'Enter the InfluxDB URL, e.g. http://localhost:8086';
  }
  if (state.auth === 'basic' && !state.username.trim()) {
    return 'Enter the InfluxDB username';
  }
  if (state.auth === 'token' && !state.token.trim()) {
    return 'Enter an InfluxDB API token';
  }
  return null;
}

export function validateInfluxDbForm(state: InfluxDbFormState): ValidationResult {
  const serverError = validateInfluxServer(state);
  if (serverError) return { isValid: false, errorMessage: serverError };
  if (!state.database.trim()) {
    return { isValid: false, errorMessage: 'Enter or pick an InfluxDB database' };
  }
  if (state.measurements.length > 0 && state.selectedMeasurements.length === 0) {
    return { isValid: false, errorMessage: 'Select at least one measurement' };
  }
  if (state.timeMode === 'last' && !DURATION_RE.test(state.last.trim())) {
    return { isValid: false, errorMessage: 'Enter a duration like 30m, 12h, 7d or 4w' };
  }
  if (state.timeMode === 'between') {
    if (!state.start) return { isValid: false, errorMessage: 'Enter the start of the time range' };
    if (state.end && state.end <= state.start) {
      return { isValid: false, errorMessage: 'The end of the time range must be after its start' };
    }
  }
  return { isValid: true, errorMessage: null };
}

export function appendInfluxDbDetails(details: ConnectionDetails, state: InfluxDbFormState): void {
  Object.assign(details, influxServerRequest(state));
  details.influx_database = state.database.trim();
  // No selection (measurements never listed) loads every measurement.
  if (state.selectedMeasurements.length > 0) {
    details.influx_measurements = state.selectedMeasurements;
  }
  details.influx_time_mode = state.timeMode;
  if (state.timeMode === 'last') {
    details.influx_last = state.last.trim();
  } else if (state.timeMode === 'between') {
    details.influx_start = state.start;
    if (state.end) details.influx_end = state.end;
  }
}

export function influxDbStateFromDetails(details: ConnectionDetails): InfluxDbFormState {
  return {
    ...DEFAULT_INFLUXDB_STATE,
    url: details.influx_url || DEFAULT_INFLUXDB_STATE.url,
    auth: details.influx_auth || 'none',
    username: details.influx_username || '',
    password: details.influx_password || '',
    token: details.influx_token || '',
    verifySsl: details.influx_verify_ssl ?? true,
    database: details.influx_database || '',
    selectedMeasurements: details.influx_measurements || [],
    timeMode: details.influx_time_mode || DEFAULT_INFLUXDB_STATE.timeMode,
    last: details.influx_last || DEFAULT_INFLUXDB_STATE.last,
    start: details.influx_start || '',
    end: details.influx_end || '',
  };
}
