// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * InfluxDbConnectionForm - server + auth, database, measurement picker and the
 * time window loaded at connect time. Talks InfluxQL to 1.8 and 2.x servers.
 */

import React, { useState } from 'react';
import { apiService } from '../../apiService';
import { InfluxAuthMode, InfluxTimeMode } from '../../types';
import { InfluxDbFormState, influxServerRequest, validateInfluxServer } from './influxdbForm';
import styles from '../../pages/DataSourceSelectionPage.module.css';
import { T } from '../../theme/tokens';

interface InfluxDbConnectionFormProps {
  state: InfluxDbFormState;
  onUpdate: (updates: Partial<InfluxDbFormState>) => void;
  disabled: boolean;
}

const LAST_PRESETS = ['1h', '24h', '7d', '30d'];

const hintStyle: React.CSSProperties = { color: T.textMuted, fontSize: '0.85em', marginTop: '4px' };

export function InfluxDbConnectionForm({ state, onUpdate, disabled }: InfluxDbConnectionFormProps) {
  const [busy, setBusy] = useState<'databases' | 'measurements' | null>(null);
  const [discoveryError, setDiscoveryError] = useState('');

  const discover = async (what: 'databases' | 'measurements') => {
    const serverError = validateInfluxServer(state);
    if (serverError) {
      setDiscoveryError(serverError);
      return;
    }
    if (what === 'measurements' && !state.database.trim()) {
      setDiscoveryError('Enter or pick a database first');
      return;
    }
    setBusy(what);
    setDiscoveryError('');
    try {
      const server = influxServerRequest(state);
      if (what === 'databases') {
        const result = await apiService.listInfluxDbDatabases(server);
        onUpdate({ databases: result.databases, serverVersion: result.server_version });
        if (result.databases.length === 0) {
          setDiscoveryError('The server lists no databases. On InfluxDB 2.x, check the DBRP mappings.');
        }
      } else {
        const result = await apiService.listInfluxDbMeasurements(server, state.database.trim());
        onUpdate({
          measurements: result.measurements,
          selectedMeasurements: result.measurements.map((m) => m.name),
        });
      }
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : `Failed to list ${what}`);
    } finally {
      setBusy(null);
    }
  };

  // Changing where we read from invalidates what was discovered there.
  const updateServer = (updates: Partial<InfluxDbFormState>) =>
    onUpdate({ ...updates, databases: [], serverVersion: null, measurements: [], selectedMeasurements: [] });

  const toggleMeasurement = (name: string, checked: boolean) => {
    const selected = new Set(state.selectedMeasurements);
    if (checked) selected.add(name);
    else selected.delete(name);
    onUpdate({ selectedMeasurements: state.measurements.map((m) => m.name).filter((n) => selected.has(n)) });
  };

  const allSelected =
    state.measurements.length > 0 && state.selectedMeasurements.length === state.measurements.length;
  const isHttps = state.url.trim().toLowerCase().startsWith('https://');

  return (
    <div className={styles.formGroup}>
      <div className={styles.kaggleSection}>
        <div className={styles.formField}>
          <label className={styles.label}>Server URL</label>
          <input
            className={`${styles.input} ${styles.inputWide}`}
            type="text"
            value={state.url}
            onChange={(e) => updateServer({ url: e.target.value })}
            placeholder="http://localhost:8086"
            disabled={disabled}
          />
          <div style={hintStyle}>
            InfluxDB 1.8, or 2.x through its v1 (InfluxQL) API. Buckets need a DBRP mapping on 2.x.
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.label}>Authentication</label>
          <select
            className={styles.select}
            value={state.auth}
            onChange={(e) => updateServer({ auth: e.target.value as InfluxAuthMode })}
            disabled={disabled}
          >
            <option value="none">None</option>
            <option value="basic">Username and password</option>
            <option value="token">API token (2.x)</option>
          </select>
        </div>

        {state.auth === 'basic' && (
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Username</label>
              <input
                className={styles.input}
                type="text"
                value={state.username}
                onChange={(e) => updateServer({ username: e.target.value })}
                autoComplete="username"
                disabled={disabled}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Password</label>
              <input
                className={styles.input}
                type="password"
                value={state.password}
                onChange={(e) => updateServer({ password: e.target.value })}
                autoComplete="current-password"
                disabled={disabled}
              />
            </div>
          </div>
        )}

        {state.auth === 'token' && (
          <div className={styles.formField}>
            <label className={styles.label}>API Token</label>
            <input
              className={`${styles.input} ${styles.inputWide}`}
              type="password"
              value={state.token}
              onChange={(e) => updateServer({ token: e.target.value })}
              disabled={disabled}
            />
            <div style={hintStyle}>Needs read access to the bucket.</div>
          </div>
        )}

        {isHttps && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={state.verifySsl}
              onChange={(e) => updateServer({ verifySsl: e.target.checked })}
              disabled={disabled}
            />
            Verify TLS certificate (turn off for self-signed certificates)
          </label>
        )}

        <div className={styles.formField}>
          <label className={styles.label}>Database</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              className={styles.input}
              type="text"
              list="influxdb-databases"
              value={state.database}
              onChange={(e) =>
                onUpdate({ database: e.target.value, measurements: [], selectedMeasurements: [] })
              }
              placeholder={state.databases.length > 0 ? 'Pick or type a database' : 'e.g. telegraf'}
              disabled={disabled}
              style={{ flex: 1 }}
            />
            <datalist id="influxdb-databases">
              {state.databases.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button
              className={styles.button}
              type="button"
              onClick={() => discover('databases')}
              disabled={disabled || busy !== null}
              style={{ minWidth: '130px' }}
            >
              {busy === 'databases' ? 'Listing...' : 'List databases'}
            </button>
          </div>
          {state.serverVersion && (
            <div style={hintStyle}>
              InfluxDB {state.serverVersion}
              {state.databases.length > 0 ? ` · ${state.databases.length} database(s)` : ''}
            </div>
          )}
        </div>

        <div className={styles.formField}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label className={styles.label} style={{ margin: 0 }}>
              Measurements
            </label>
            <button
              className={styles.button}
              type="button"
              onClick={() => discover('measurements')}
              disabled={disabled || busy !== null || !state.database.trim()}
              style={{ minWidth: '160px' }}
            >
              {busy === 'measurements' ? 'Loading...' : 'Load measurements'}
            </button>
            {state.measurements.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9em' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    onUpdate({ selectedMeasurements: e.target.checked ? state.measurements.map((m) => m.name) : [] })
                  }
                  disabled={disabled}
                  style={{ marginRight: '6px' }}
                />
                Select all
              </label>
            )}
          </div>
          {state.measurements.length === 0 ? (
            <div style={hintStyle}>
              {state.selectedMeasurements.length > 0
                ? `Loads: ${state.selectedMeasurements.join(', ')}`
                : 'Without a selection, every measurement in the database is loaded.'}
            </div>
          ) : (
            <div
              style={{
                marginTop: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
                border: `1px solid ${T.borderMuted}`,
                borderRadius: '4px',
              }}
            >
              {state.measurements.map((m) => (
                <label
                  key={m.name}
                  style={{ display: 'block', padding: '6px 10px', borderBottom: `1px solid ${T.borderSubtle}` }}
                >
                  <input
                    type="checkbox"
                    checked={state.selectedMeasurements.includes(m.name)}
                    onChange={(e) => toggleMeasurement(m.name, e.target.checked)}
                    disabled={disabled}
                    style={{ marginRight: '8px' }}
                  />
                  <strong>{m.name}</strong>
                  <span style={{ fontSize: '0.85em', color: T.textMuted, marginLeft: '6px' }}>
                    {m.tag_count} tag{m.tag_count === 1 ? '' : 's'} · {m.field_count} field
                    {m.field_count === 1 ? '' : 's'}
                    {m.table_name !== m.name ? ` · table ${m.table_name}` : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className={styles.formField}>
          <label className={styles.label}>Time range</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className={styles.select}
              value={state.timeMode}
              onChange={(e) => onUpdate({ timeMode: e.target.value as InfluxTimeMode })}
              disabled={disabled}
            >
              <option value="last">Last</option>
              <option value="between">Between (UTC)</option>
              <option value="all">All time</option>
            </select>

            {state.timeMode === 'last' && (
              <>
                <input
                  className={`${styles.input} ${styles.inputSmall}`}
                  type="text"
                  list="influxdb-last-presets"
                  value={state.last}
                  onChange={(e) => onUpdate({ last: e.target.value })}
                  placeholder="7d"
                  disabled={disabled}
                />
                <datalist id="influxdb-last-presets">
                  {LAST_PRESETS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </>
            )}

            {state.timeMode === 'between' && (
              <>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={state.start}
                  onChange={(e) => onUpdate({ start: e.target.value })}
                  disabled={disabled}
                />
                <span>to</span>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={state.end}
                  onChange={(e) => onUpdate({ end: e.target.value })}
                  disabled={disabled}
                />
              </>
            )}
          </div>
          <div style={hintStyle}>
            {state.timeMode === 'last' && 'Duration in s, m, h, d or w, counted back from now. '}
            {state.timeMode === 'between' && 'Leave the end empty to load up to now. '}
            {state.timeMode === 'all' && 'Loads every point; this can be a lot for long-lived databases. '}
            Points are loaded once when connecting; reconnect to refresh. Times are UTC.
          </div>
        </div>

        {discoveryError && <div className={styles.errorMessage}>{discoveryError}</div>}
      </div>
    </div>
  );
}
