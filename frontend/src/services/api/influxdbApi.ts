// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * InfluxDB API Service: pre-connect discovery of databases and measurements.
 */

import { InfluxDatabasesResponse, InfluxMeasurementsResponse, InfluxServerRequest } from '../../types';
import { fetchWithErrorHandling, API_BASE_URL } from './apiClient';

export const influxDbApi = {
  /** List databases (2.x: buckets with a DBRP mapping) and the server version. */
  async listInfluxDbDatabases(server: InfluxServerRequest): Promise<InfluxDatabasesResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/influxdb/databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(server),
    });
    return response.json();
  },

  /** List the measurements of a database with their tag and field counts. */
  async listInfluxDbMeasurements(
    server: InfluxServerRequest,
    database: string
  ): Promise<InfluxMeasurementsResponse> {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/influxdb/measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...server, influx_database: database }),
    });
    return response.json();
  },
};
