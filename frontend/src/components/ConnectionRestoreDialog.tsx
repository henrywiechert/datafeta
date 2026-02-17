import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
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

interface ConnectionRestoreDialogProps {
  open: boolean;
  connectionMetadata: SavedConnectionMetadata | null;
  onConnect: (
    password: string,
    files?: File[],
    kaggleUsername?: string,
    kaggleApiKey?: string,
    clickHouseOverrides?: ClickHouseOverrides
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

  useEffect(() => {
    if (open && connectionMetadata) {
      setPassword('');
      setFile(null);
      setKaggleUsername('');
      setKaggleApiKey('');
      setError(null);
      setIsConnecting(false);

      // Initialize ClickHouse fields from metadata
      if (connectionMetadata.type === 'clickhouse') {
        setHost(connectionMetadata.host || '');
        setPort(connectionMetadata.port?.toString() || '');
        setUser(connectionMetadata.user || '');
        setDatabase(connectionMetadata.database || '');
      }
    }
  }, [open, connectionMetadata]);

  if (!connectionMetadata) return null;

  const isClickHouse = connectionMetadata.type === 'clickhouse';
  const isCsv = connectionMetadata.type === 'csv';
  const isKaggle = connectionMetadata.type === 'kaggle';

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
        clickHouseOverrides
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

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Restore Connection</DialogTitle>
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
          disabled={isConnecting || (isCsv && !file) || (isKaggle && (!kaggleUsername || !kaggleApiKey))}
          startIcon={isConnecting ? <CircularProgress size={20} /> : null}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

