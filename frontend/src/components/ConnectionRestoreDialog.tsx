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
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { SavedConnectionMetadata } from '../types';

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

export interface ConnectionRestoreOptions {
  swapSameSchema?: boolean;
}

interface ConnectionRestoreDialogProps {
  open: boolean;
  connectionMetadata: SavedConnectionMetadata | null;
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

export default function ConnectionRestoreDialog({
  open,
  connectionMetadata,
  onConnect,
  onCancel,
  onSkip,
}: ConnectionRestoreDialogProps) {
  const [password, setPassword] = useState('');
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

      // Initialize ClickHouse fields from metadata
      if (connectionMetadata.type === 'clickhouse') {
        setHost(connectionMetadata.host || '');
        setPort(connectionMetadata.port?.toString() || '');
        setUser(connectionMetadata.user || '');
        setDatabase(connectionMetadata.database || '');
      }
      setSwapSameSchema(false);
    }
  }, [open, connectionMetadata]);

  const isClickHouse = connectionMetadata?.type === 'clickhouse';
  const isCsv = connectionMetadata?.type === 'csv';
  const isKaggle = connectionMetadata?.type === 'kaggle';
  const isHiveParquet = connectionMetadata?.type === 'hive_parquet';

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

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // For CSV, we need a file
      if (isCsv && !file) {
        setError('Please select a CSV file');
        setIsConnecting(false);
        return;
      }

      // For Kaggle, we need credentials
      if (isKaggle && (!kaggleUsername || !kaggleApiKey)) {
        setError('Please provide Kaggle username and API key');
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
        { swapSameSchema: swapSameSchema || undefined },
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
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                ClickHouse Connection
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                <TextField
                  autoFocus
                  margin="dense"
                  label="Host"
                  type="text"
                  fullWidth
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  disabled={isConnecting}
                  sx={{ flex: 2 }}
                />
                <TextField
                  margin="dense"
                  label="Port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={isConnecting}
                  sx={{ flex: 1 }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                <TextField
                  margin="dense"
                  label="User"
                  type="text"
                  fullWidth
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  disabled={isConnecting}
                />
                <TextField
                  margin="dense"
                  label="Database"
                  type="text"
                  fullWidth
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  disabled={isConnecting}
                />
              </Box>

              <TextField
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
              />

              <FormControlLabel
                sx={{ mt: 1, alignItems: 'flex-start' }}
                control={
                  <Checkbox
                    checked={swapSameSchema}
                    onChange={(e) => setSwapSameSchema(e.target.checked)}
                    disabled={isConnecting}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Same schema — swap database only</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Keep saved table selections and sheet layouts. Tables and columns must exist in the new database.
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
              <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
              </Box>

              <Button
                variant="outlined"
                component="label"
                fullWidth
                disabled={isConnecting}
              >
                {file ? `Selected: ${file.name}` : 'Select Data File (CSV/Parquet)'}
                <input
                  type="file"
                  accept=".csv,.parquet"
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

          {isKaggle && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Kaggle Dataset
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
                  <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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

          {isHiveParquet && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Hive Parquet Connection
              </Typography>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
          disabled={isConnecting || (isCsv && !file) || (isKaggle && (!kaggleUsername || !kaggleApiKey)) || (isHiveParquet && !allHivePartitionsHaveFiles)}
          startIcon={isConnecting ? <CircularProgress size={20} /> : null}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

