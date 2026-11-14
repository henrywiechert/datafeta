// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Autocomplete,
  MenuItem,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { InfluxMeasurement, InfluxTimeMode, SavedConnectionMetadata } from '../types';
import { apiService } from '../apiService';
import { reconstructConnectionDetails } from '../services/configurationService';
import {
  DEFAULT_INFLUXDB_STATE,
  influxDbStateFromDetails,
  influxServerRequest,
  validateInfluxTimeRange,
} from './ConnectionForms/influxdbForm';
import { dataFileAccept, SQLITE_FILE_ACCEPT } from '../utils/uploadFileTypes';
import { useFileFormats } from '../contexts/AppConfigContext';

/**
 * Override values for ClickHouse connection parameters.
 * Allows user to modify host, port, user, database when restoring a snapshot.
 */
export interface ClickHouseOverrides {
  host?: string;
  port?: number;
  user?: string;
  database?: string;
}

/** Time window loaded from InfluxDB; `start`/`end` are datetime-local values read as UTC. */
export interface InfluxTimeRange {
  mode: InfluxTimeMode;
  last?: string;
  start?: string;
  end?: string;
}

/**
 * InfluxDB database, measurements and time range to load instead of the saved
 * ones. An empty `measurements` list loads every measurement of the database;
 * without `timeRange` the saved one applies.
 */
export interface InfluxDbOverrides {
  database: string;
  measurements: string[];
  timeRange?: InfluxTimeRange;
}

export interface ConnectionRestoreOptions {
  swapSameSchema?: boolean;
  influxDb?: InfluxDbOverrides;
}

interface ConnectionRestoreDialogProps {
  open: boolean;
  connectionMetadata: SavedConnectionMetadata | null;
  /** When set (ClickHouse URL `?database=`), prefill DB and lock same-schema swap on. */
  databaseOverride?: string | null;
  onConnect: (
    password: string,
    files?: File[],
    kaggleUsername?: string,
    kaggleApiKey?: string,
    clickHouseOverrides?: ClickHouseOverrides,
    hivePartitionFiles?: Map<string, File[]>,
    hiveFileStructure?: string[],
    restoreOptions?: ConnectionRestoreOptions,
  ) => Promise<void>;
  onCancel: () => void;
  onSkip: () => void;
}

const INFLUX_LAST_PRESETS = ['1h', '24h', '7d', '30d'];

export default function ConnectionRestoreDialog({
  open,
  connectionMetadata,
  databaseOverride = null,
  onConnect,
  onCancel,
  onSkip,
}: ConnectionRestoreDialogProps) {
  const [password, setPassword] = useState('');
  const fileFormats = useFileFormats();
  const [file, setFile] = useState<File | null>(null);
  const [kaggleUsername, setKaggleUsername] = useState('');
  const [kaggleApiKey, setKaggleApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ClickHouse editable fields
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [user, setUser] = useState('');
  const [database, setDatabase] = useState('');
  const [swapSameSchema, setSwapSameSchema] = useState(false);

  // InfluxDB database / measurement selection. `influxMeasurements` stays
  // empty until "Load measurements"; the saved selection applies until then.
  const [influxDatabase, setInfluxDatabase] = useState('');
  const [influxDatabases, setInfluxDatabases] = useState<string[]>([]);
  const [influxMeasurements, setInfluxMeasurements] = useState<InfluxMeasurement[]>([]);
  const [influxSelected, setInfluxSelected] = useState<string[]>([]);
  const [influxBusy, setInfluxBusy] = useState<'databases' | 'measurements' | null>(null);
  const [influxTimeMode, setInfluxTimeMode] = useState<InfluxTimeMode>('last');
  const [influxLast, setInfluxLast] = useState('');
  const [influxStart, setInfluxStart] = useState('');
  const [influxEnd, setInfluxEnd] = useState('');

  // Hive Parquet partition files (auto-populated from folder selection)
  const [hivePartitionFiles, setHivePartitionFilesLocal] = useState<Map<string, File[]>>(new Map());
  const [hiveFolderName, setHiveFolderName] = useState<string | null>(null);
  const [hiveFileStructure, setHiveFileStructure] = useState<string[]>([]);

  useEffect(() => {
    if (open && connectionMetadata) {
      setPassword('');
      setFile(null);
      setKaggleUsername('');
      setKaggleApiKey('');
      setError(null);
      setIsConnecting(false);
      setHivePartitionFilesLocal(new Map());
      setHiveFolderName(null);
      setHiveFileStructure([]);

      // Initialize ClickHouse fields from metadata (URL database override wins when present)
      if (connectionMetadata.type === 'clickhouse') {
        setHost(connectionMetadata.host || '');
        setPort(connectionMetadata.port?.toString() || '');
        setUser(connectionMetadata.user || '');
        setDatabase(databaseOverride || connectionMetadata.database || '');
      }
      setSwapSameSchema(Boolean(databaseOverride));

      setInfluxDatabase(connectionMetadata.influx_database || '');
      setInfluxDatabases([]);
      setInfluxMeasurements([]);
      setInfluxSelected(connectionMetadata.influx_measurements || []);
      setInfluxBusy(null);
      // A snapshot without a mode loaded everything (the server's default).
      setInfluxTimeMode(connectionMetadata.influx_time_mode || 'all');
      setInfluxLast(connectionMetadata.influx_last || DEFAULT_INFLUXDB_STATE.last);
      setInfluxStart(connectionMetadata.influx_start || '');
      setInfluxEnd(connectionMetadata.influx_end || '');
    }
  }, [open, connectionMetadata, databaseOverride]);

  const swapLockedByUrl = Boolean(databaseOverride);

  const isClickHouse = connectionMetadata?.type === 'clickhouse';
  const isCsv = connectionMetadata?.type === 'csv';
  const isSqlite = connectionMetadata?.type === 'sqlite';
  const isKaggle = connectionMetadata?.type === 'kaggle';
  const isHiveParquet = connectionMetadata?.type === 'hive_parquet';
  const isInfluxDb = connectionMetadata?.type === 'influxdb';
  const influxAuth = connectionMetadata?.influx_auth || 'none';
  const influxNeedsToken = isInfluxDb && influxAuth === 'token';

  const hivePartitionsToRestore = useMemo(
    () => connectionMetadata?.hive_loaded_partitions || [],
    [connectionMetadata?.hive_loaded_partitions]
  );
  const allHivePartitionsHaveFiles = useMemo(() => {
    if (!isHiveParquet) return true;
    return hivePartitionsToRestore.length > 0 &&
      hivePartitionsToRestore.every(p => (hivePartitionFiles.get(p)?.length ?? 0) > 0);
  }, [isHiveParquet, hivePartitionsToRestore, hivePartitionFiles]);

  if (!connectionMetadata) return null;

  const influxSecretMissing = influxNeedsToken && !password;

  const discoverInflux = async (what: 'databases' | 'measurements') => {
    if (influxSecretMissing) {
      setError('Please provide the InfluxDB API token');
      return;
    }
    const database = influxDatabase.trim();
    if (what === 'measurements' && !database) {
      setError('Enter or pick a database first');
      return;
    }
    setInfluxBusy(what);
    setError(null);
    try {
      const server = influxServerRequest(
        influxDbStateFromDetails(reconstructConnectionDetails(connectionMetadata, password)),
      );
      if (what === 'databases') {
        const result = await apiService.listInfluxDbDatabases(server);
        setInfluxDatabases(result.databases);
        if (result.databases.length === 0) {
          setError('The server lists no databases. On InfluxDB 2.x, check the DBRP mappings.');
        }
      } else {
        const result = await apiService.listInfluxDbMeasurements(server, database);
        const names = result.measurements.map((m) => m.name);
        // Keep the saved choice where it still exists; "all" stays all.
        const kept = influxSelected.length > 0 ? names.filter((n) => influxSelected.includes(n)) : [];
        setInfluxMeasurements(result.measurements);
        setInfluxSelected(kept.length > 0 ? kept : names);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to list ${what}`);
    } finally {
      setInfluxBusy(null);
    }
  };

  const changeInfluxDatabase = (value: string) => {
    setInfluxDatabase(value);
    // Measurements listed for another database no longer apply.
    setInfluxMeasurements([]);
  };

  const toggleInfluxMeasurement = (name: string, checked: boolean) => {
    const selected = new Set(influxSelected);
    if (checked) selected.add(name);
    else selected.delete(name);
    setInfluxSelected(influxMeasurements.map((m) => m.name).filter((n) => selected.has(n)));
  };

  const allInfluxSelected =
    influxMeasurements.length > 0 && influxSelected.length === influxMeasurements.length;

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // For CSV, we need a file
      if (isCsv && !file) {
        setError('Please select a data file');
        setIsConnecting(false);
        return;
      }

      // For SQLite, we need the database file
      if (isSqlite && !file) {
        setError('Please select a SQLite database file');
        setIsConnecting(false);
        return;
      }

      // For Kaggle, we need credentials
      if (isKaggle && (!kaggleUsername || !kaggleApiKey)) {
        setError('Please provide Kaggle username and API key');
        setIsConnecting(false);
        return;
      }

      // For InfluxDB token auth, the token is required
      if (influxNeedsToken && !password) {
        setError('Please provide the InfluxDB API token');
        setIsConnecting(false);
        return;
      }

      if (isInfluxDb && !influxDatabase.trim()) {
        setError('Enter or pick an InfluxDB database');
        setIsConnecting(false);
        return;
      }
      if (isInfluxDb && influxMeasurements.length > 0 && influxSelected.length === 0) {
        setError('Select at least one measurement');
        setIsConnecting(false);
        return;
      }
      const influxTimeError = isInfluxDb
        ? validateInfluxTimeRange({ timeMode: influxTimeMode, last: influxLast, start: influxStart, end: influxEnd })
        : null;
      if (influxTimeError) {
        setError(influxTimeError);
        setIsConnecting(false);
        return;
      }

      // For ClickHouse, validate required fields
      if (isClickHouse && (!host || !port)) {
        setError('Host and port are required');
        setIsConnecting(false);
        return;
      }

      // For Hive Parquet, validate all partitions have files
      if (isHiveParquet) {
        if (hivePartitionFiles.size === 0) {
          setError('Please select the dataset folder');
          setIsConnecting(false);
          return;
        }
        const missingPartitions = hivePartitionsToRestore.filter(
          p => !(hivePartitionFiles.get(p)?.length)
        );
        if (missingPartitions.length > 0) {
          setError(`The selected folder is missing partitions: ${missingPartitions.join(', ')}`);
          setIsConnecting(false);
          return;
        }
      }

      // Build ClickHouse overrides if applicable
      const clickHouseOverrides: ClickHouseOverrides | undefined = isClickHouse
        ? {
            host: host || undefined,
            port: port ? parseInt(port, 10) : undefined,
            user: user || undefined,
            database: database || undefined,
          }
        : undefined;

      // Pass file as array for multi-file API compatibility
      await onConnect(
        password,
        file ? [file] : undefined,
        kaggleUsername || undefined,
        kaggleApiKey || undefined,
        clickHouseOverrides,
        isHiveParquet ? hivePartitionFiles : undefined,
        isHiveParquet ? hiveFileStructure : undefined,
        {
          swapSameSchema: swapSameSchema || undefined,
          influxDb: isInfluxDb
            ? {
                database: influxDatabase.trim(),
                measurements: influxSelected,
                timeRange: {
                  mode: influxTimeMode,
                  last: influxLast.trim(),
                  start: influxStart,
                  end: influxEnd,
                },
              }
            : undefined,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsConnecting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  /**
   * Handle folder selection for Hive Parquet restore.
   * Parses the folder, groups files by partition, and auto-matches to saved partitions.
   */
  const handleHiveFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const files = Array.from(event.target.files);
    const parquetFiles = files.filter(f => f.name.toLowerCase().endsWith('.parquet'));

    if (parquetFiles.length === 0) {
      setError('No parquet files found in the selected folder');
      setHivePartitionFilesLocal(new Map());
      setHiveFolderName(null);
      setHiveFileStructure([]);
      return;
    }

    // Extract relative paths (for Phase 1 connect)
    const fileStructure = parquetFiles.map(f => f.webkitRelativePath);

    // Get folder name from first file
    const firstPath = fileStructure[0];
    const folderName = firstPath ? firstPath.split('/')[0] : null;

    // Group files by partition value using the same pattern as HiveParquetConnectionForm
    const partitionPattern = /^[^/]+\/([^=]+)=([^/]+)\//;
    const partitionFiles = new Map<string, File[]>();

    for (const file of parquetFiles) {
      const match = file.webkitRelativePath.match(partitionPattern);
      if (match) {
        const partitionValue = match[2];
        if (!partitionFiles.has(partitionValue)) {
          partitionFiles.set(partitionValue, []);
        }
        partitionFiles.get(partitionValue)!.push(file);
      }
    }

    setHivePartitionFilesLocal(partitionFiles);
    setHiveFolderName(folderName);
    setHiveFileStructure(fileStructure);
    setError(null);
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth aria-labelledby="connection-restore-title">
      <DialogTitle id="connection-restore-title">Restore Connection</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The loaded configuration includes connection settings. Please provide the required credentials to reconnect.
          </Typography>

          {isClickHouse && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                ClickHouse Connection
              </Typography>

              <Box sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
                <TextField
                  autoFocus
                  size="small"
                  margin="dense"
                  label="Host"
                  type="text"
                  fullWidth
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  disabled={isConnecting}
                  sx={{ flex: 2, my: 0 }}
                />
                <TextField
                  size="small"
                  margin="dense"
                  label="Port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={isConnecting}
                  sx={{ flex: 1, my: 0 }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
                <TextField
                  size="small"
                  margin="dense"
                  label="User"
                  type="text"
                  fullWidth
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  disabled={isConnecting}
                  sx={{ my: 0 }}
                />
                <TextField
                  size="small"
                  margin="dense"
                  label="Database"
                  type="text"
                  fullWidth
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  disabled={isConnecting}
                  sx={{ my: 0 }}
                />
              </Box>

              <TextField
                size="small"
                margin="dense"
                label="Password"
                type="password"
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isConnecting) {
                    e.preventDefault();
                    handleConnect();
                  }
                }}
                disabled={isConnecting}
                sx={{ my: 0 }}
              />

              <FormControlLabel
                sx={{ mt: 0.5, alignItems: 'flex-start' }}
                control={
                  <Checkbox
                    size="small"
                    checked={swapSameSchema}
                    onChange={(e) => setSwapSameSchema(e.target.checked)}
                    disabled={isConnecting || swapLockedByUrl}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Same schema — swap database only</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Keep saved table selections and sheet layouts. Tables and columns must exist in the new database.
                      {swapLockedByUrl
                        ? ' Enabled by the database URL parameter.'
                        : ''}
                    </Typography>
                  </Box>
                }
              />
            </>
          )}

          {isCsv && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                CSV Configuration
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Delimiter:</strong> {connectionMetadata.csv_delimiter || ','}
                </Typography>
                <Typography variant="body2">
                  <strong>Has Header:</strong> {connectionMetadata.csv_has_header ? 'Yes' : 'No'}
                </Typography>
                {connectionMetadata.csv_decimal_separator && (
                  <Typography variant="body2">
                    <strong>Decimal Separator:</strong> {connectionMetadata.csv_decimal_separator}
                  </Typography>
                )}
                {connectionMetadata.csv_thousands_separator && (
                  <Typography variant="body2">
                    <strong>Thousands Separator:</strong> {connectionMetadata.csv_thousands_separator}
                  </Typography>
                )}
                <Typography variant="body2">
                  <strong>Type Inference Sample:</strong>{' '}
                  {connectionMetadata.csv_sample_full_dataset
                    ? 'Full dataset'
                    : `${connectionMetadata.csv_sample_size || 1000} rows`}
                </Typography>
                <Typography variant="body2">
                  <strong>Fix Numeric Whitespace:</strong>{' '}
                  {connectionMetadata.csv_trim_numeric_whitespace ? 'Yes' : 'No'}
                </Typography>
                {connectionMetadata.file_parts && Object.entries(connectionMetadata.file_parts).map(
                  ([filename, parts]) => (
                    <Typography variant="body2" key={filename}>
                      <strong>Loaded from {filename}:</strong> {parts.join(', ')}
                    </Typography>
                  )
                )}
              </Box>

              <Button
                variant="outlined"
                component="label"
                fullWidth
                disabled={isConnecting}
              >
                {file ? `Selected: ${file.name}` : 'Select Data File'}
                <input
                  type="file"
                  accept={dataFileAccept(fileFormats)}
                  hidden
                  onChange={handleFileChange}
                />
              </Button>

              <FormControlLabel
                sx={{ mt: 1.5, alignItems: 'flex-start' }}
                control={
                  <Checkbox
                    checked={swapSameSchema}
                    onChange={(e) => setSwapSameSchema(e.target.checked)}
                    disabled={isConnecting}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Same schema — swap file only</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Keep saved sheet layouts. Column headers must match.
                    </Typography>
                  </Box>
                }
              />
            </>
          )}

          {isSqlite && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                SQLite Database
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Select the SQLite database file this configuration was built on.
                Table and column names must match.
              </Typography>

              <Button
                variant="outlined"
                component="label"
                fullWidth
                disabled={isConnecting}
                color={file ? 'success' : 'primary'}
              >
                {file ? `Selected: ${file.name}` : 'Select Database File (.sqlite/.sqlite3/.db)'}
                <input
                  type="file"
                  accept={SQLITE_FILE_ACCEPT}
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
            </>
          )}

          {isKaggle && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Kaggle Dataset
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Dataset:</strong> {connectionMetadata.kaggle_dataset || 'N/A'}
                </Typography>
                {connectionMetadata.kaggle_csv_files && connectionMetadata.kaggle_csv_files.length > 0 && (
                  <Typography variant="body2">
                    <strong>CSV Files:</strong> {connectionMetadata.kaggle_csv_files.join(', ')}
                  </Typography>
                )}
              </Box>

              {(connectionMetadata.csv_delimiter ||
                connectionMetadata.csv_date_format ||
                connectionMetadata.csv_timestamp_format) && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    CSV Parsing Options
                  </Typography>
                  <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2">
                      <strong>Delimiter:</strong> {connectionMetadata.csv_delimiter || ','}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Has Header:</strong>{' '}
                      {connectionMetadata.csv_has_header !== false ? 'Yes' : 'No'}
                    </Typography>
                    {connectionMetadata.csv_date_format && (
                      <Typography variant="body2">
                        <strong>Date Format:</strong> {connectionMetadata.csv_date_format}
                      </Typography>
                    )}
                    {connectionMetadata.csv_timestamp_format && (
                      <Typography variant="body2">
                        <strong>Timestamp Format:</strong>{' '}
                        {connectionMetadata.csv_timestamp_format}
                      </Typography>
                    )}
                    <Typography variant="body2">
                      <strong>Type Inference Sample:</strong>{' '}
                      {connectionMetadata.csv_sample_full_dataset
                        ? 'Full dataset'
                        : `${connectionMetadata.csv_sample_size || 1000} rows`}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Fix Numeric Whitespace:</strong>{' '}
                      {connectionMetadata.csv_trim_numeric_whitespace ? 'Yes' : 'No'}
                    </Typography>
                  </Box>
                </>
              )}

              <TextField
                autoFocus
                margin="dense"
                label="Kaggle Username"
                type="text"
                fullWidth
                value={kaggleUsername}
                onChange={(e) => setKaggleUsername(e.target.value)}
                disabled={isConnecting}
                sx={{ mb: 2 }}
              />

              <TextField
                margin="dense"
                label="Kaggle API Key"
                type="password"
                fullWidth
                value={kaggleApiKey}
                onChange={(e) => setKaggleApiKey(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isConnecting) {
                    e.preventDefault();
                    handleConnect();
                  }
                }}
                disabled={isConnecting}
              />
            </>
          )}

          {isInfluxDb && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                InfluxDB Connection
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Server:</strong> {connectionMetadata.influx_url}
                  {connectionMetadata.influx_username ? ` (as ${connectionMetadata.influx_username})` : ''}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Points are loaded again from the server, so recent data is included.
              </Typography>

              {influxAuth !== 'none' && (
                <TextField
                  autoFocus
                  margin="dense"
                  label={influxNeedsToken ? 'API Token' : 'Password'}
                  type="password"
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !isConnecting) {
                      e.preventDefault();
                      handleConnect();
                    }
                  }}
                  disabled={isConnecting}
                />
              )}

              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 1 }}>
                <Autocomplete
                  freeSolo
                  fullWidth
                  size="small"
                  options={influxDatabases}
                  // Show every database while the field holds one exactly
                  // (e.g. the saved name); filter only while typing another.
                  filterOptions={(options, { inputValue }) =>
                    options.includes(inputValue)
                      ? options
                      : options.filter((o) => o.toLowerCase().includes(inputValue.trim().toLowerCase()))
                  }
                  inputValue={influxDatabase}
                  onInputChange={(_, value) => changeInfluxDatabase(value)}
                  disabled={isConnecting}
                  renderInput={(params) => (
                    <TextField {...params} label="Database" placeholder="e.g. telegraf" />
                  )}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => discoverInflux('databases')}
                  disabled={isConnecting || influxBusy !== null || influxSecretMissing}
                  sx={{ minWidth: 140, whiteSpace: 'nowrap' }}
                >
                  {influxBusy === 'databases' ? 'Listing...' : 'List databases'}
                </Button>
              </Box>

              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Measurements</Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => discoverInflux('measurements')}
                  disabled={isConnecting || influxBusy !== null || influxSecretMissing || !influxDatabase.trim()}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  {influxBusy === 'measurements' ? 'Loading...' : 'Load measurements'}
                </Button>
                {influxMeasurements.length > 0 && (
                  <FormControlLabel
                    sx={{ ml: 0 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={allInfluxSelected}
                        onChange={(e) =>
                          setInfluxSelected(e.target.checked ? influxMeasurements.map((m) => m.name) : [])
                        }
                        disabled={isConnecting}
                      />
                    }
                    label={<Typography variant="body2">Select all</Typography>}
                  />
                )}
              </Box>
              {influxMeasurements.length === 0 ? (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  {influxSelected.length > 0
                    ? `Loads: ${influxSelected.join(', ')}`
                    : 'Loads every measurement in the database.'}
                </Typography>
              ) : (
                <Box
                  sx={{
                    mt: 0.5,
                    maxHeight: 200,
                    overflowY: 'auto',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  {influxMeasurements.map((m) => (
                    <FormControlLabel
                      key={m.name}
                      sx={{ display: 'flex', mx: 0, px: 1 }}
                      control={
                        <Checkbox
                          size="small"
                          checked={influxSelected.includes(m.name)}
                          onChange={(e) => toggleInfluxMeasurement(m.name, e.target.checked)}
                          disabled={isConnecting}
                        />
                      }
                      label={
                        <Typography variant="body2">
                          <strong>{m.name}</strong>{' '}
                          <Typography component="span" variant="caption" color="text.secondary">
                            {m.tag_count} tag{m.tag_count === 1 ? '' : 's'} · {m.field_count} field
                            {m.field_count === 1 ? '' : 's'}
                          </Typography>
                        </Typography>
                      }
                    />
                  ))}
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mt: 2, flexWrap: 'wrap' }}>
                <TextField
                  select
                  size="small"
                  label="Time range"
                  value={influxTimeMode}
                  onChange={(e) => setInfluxTimeMode(e.target.value as InfluxTimeMode)}
                  disabled={isConnecting}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="last">Last</MenuItem>
                  <MenuItem value="between">Between (UTC)</MenuItem>
                  <MenuItem value="all">All time</MenuItem>
                </TextField>
                {influxTimeMode === 'last' && (
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={INFLUX_LAST_PRESETS}
                    filterOptions={(options) => options}
                    inputValue={influxLast}
                    onInputChange={(_, value) => setInfluxLast(value)}
                    disabled={isConnecting}
                    sx={{ width: 140 }}
                    renderInput={(params) => <TextField {...params} label="Duration" placeholder="7d" />}
                  />
                )}
                {influxTimeMode === 'between' && (
                  <>
                    <TextField
                      size="small"
                      type="datetime-local"
                      label="Start (UTC)"
                      value={influxStart}
                      onChange={(e) => setInfluxStart(e.target.value)}
                      disabled={isConnecting}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      size="small"
                      type="datetime-local"
                      label="End (UTC)"
                      value={influxEnd}
                      onChange={(e) => setInfluxEnd(e.target.value)}
                      disabled={isConnecting}
                      InputLabelProps={{ shrink: true }}
                      helperText="Empty loads up to now"
                    />
                  </>
                )}
              </Box>
              {influxTimeMode === 'all' && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  Loads every point; this can be a lot for long-lived databases.
                </Typography>
              )}

              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                Sheets keep their saved fields; a changed database or measurement set must contain them.
              </Typography>
            </>
          )}

          {isHiveParquet && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Hive Parquet Connection
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Partitions to restore:</strong> {hivePartitionsToRestore.join(', ') || 'None'}
                </Typography>
                {connectionMetadata.hive_primary_partition && (
                  <Typography variant="body2">
                    <strong>Primary partition:</strong> {connectionMetadata.hive_primary_partition}
                  </Typography>
                )}
                {connectionMetadata.hive_union_partitions && connectionMetadata.hive_union_partitions.length > 0 && (
                  <Typography variant="body2">
                    <strong>Union partitions:</strong> {connectionMetadata.hive_union_partitions.join(', ')}
                  </Typography>
                )}
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Select the root folder containing the Hive-partitioned Parquet files:
              </Typography>

              <Button
                variant="outlined"
                component="label"
                fullWidth
                disabled={isConnecting}
                color={hiveFolderName ? 'success' : 'primary'}
              >
                {hiveFolderName
                  ? `Folder: ${hiveFolderName} (${hiveFileStructure.length} parquet files)`
                  : 'Select Dataset Folder'}
                <input
                  type="file"
                  /* @ts-expect-error - webkitdirectory is not in React's HTMLInputElement type */
                  webkitdirectory=""
                  directory=""
                  hidden
                  onChange={handleHiveFolderChange}
                />
              </Button>

              {hiveFolderName && hivePartitionsToRestore.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Partition match status:
                  </Typography>
                  {hivePartitionsToRestore.map((partition) => {
                    const files = hivePartitionFiles.get(partition);
                    const matched = files && files.length > 0;
                    return (
                      <Box key={partition} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1, mb: 0.25 }}>
                        {matched
                          ? <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                          : <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                        <Typography variant="body2" color={matched ? 'text.primary' : 'error.main'}>
                          {partition}{matched ? ` (${files!.length} file${files!.length > 1 ? 's' : ''})` : ' — not found'}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isConnecting}>
          Cancel
        </Button>
        <Button onClick={onSkip} disabled={isConnecting}>
          Skip Connection
        </Button>
        <Button
          onClick={handleConnect}
          variant="contained"
          disabled={isConnecting || ((isCsv || isSqlite) && !file) || (isKaggle && (!kaggleUsername || !kaggleApiKey)) || (isHiveParquet && !allHivePartitionsHaveFiles) || influxSecretMissing || influxBusy !== null}
          startIcon={isConnecting ? <CircularProgress size={20} /> : null}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

