// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * InfluxDB (1.8 / 2.x over InfluxQL) connection and discovery types.
 */

export type InfluxAuthMode = 'none' | 'basic' | 'token';

/** all = every point; last = a window ending now; between = fixed UTC bounds. */
export type InfluxTimeMode = 'all' | 'last' | 'between';

/** Server settings sent to the discovery endpoints (and, with more, to /connect). */
export interface InfluxServerRequest {
  influx_url: string;
  influx_auth: InfluxAuthMode;
  influx_username?: string;
  influx_password?: string;
  influx_token?: string;
  influx_verify_ssl: boolean;
}

export interface InfluxMeasurement {
  name: string;
  /** The DuckDB table the measurement is loaded into. */
  table_name: string;
  tag_count: number;
  field_count: number;
}

export interface InfluxDatabasesResponse {
  server_version: string | null;
  databases: string[];
}

export interface InfluxMeasurementsResponse {
  measurements: InfluxMeasurement[];
}
