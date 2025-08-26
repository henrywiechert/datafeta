import React, { useState, useEffect, ChangeEvent } from 'react';
import { ConnectionDetails } from '../types';
import { useConnection } from '../contexts/ConnectionContext';
import { Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  Stack,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import LabeledTextField from '../components/LabeledTextField';

function DataSourceSelectionPage() {
  const { isConnected, isLoading, error, message, connect, disconnect, connectionDetails } = useConnection();

  const [connectionType, setConnectionType] = useState<'csv' | 'clickhouse'>('clickhouse');
  const [filePath, setFilePath] = useState<string>('');
  const [connString, setConnString] = useState<string>('');
  const [host, setHost] = useState<string>('localhost');
  const [port, setPort] = useState<number | string>(8123);
  const [user, setUser] = useState<string>('default');
  const [password, setPassword] = useState<string>('');
  const [dbName, setDbName] = useState<string>('default');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (isConnected && connectionDetails) {
      setConnectionType(connectionDetails.type);
      setConnString(connectionDetails.connection_string || '');
      setHost(connectionDetails.host || 'localhost');
      setPort(connectionDetails.port || 8123);
      setUser(connectionDetails.user || 'default');
      setPassword(connectionDetails.password || '');
      setDbName(connectionDetails.database || 'default');
      setFilePath('');
      setSelectedFile(null);
    }
  }, [isConnected, connectionDetails]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setFilePath(event.target.files[0].name);
    } else {
      setSelectedFile(null);
      setFilePath('');
    }
  };

  const handleConnect = async () => {
    let details: ConnectionDetails = { type: connectionType };
    let formError: string | null = null;

    if (connectionType === 'csv') {
      if (!selectedFile) {
        formError = 'CSV File is required. Please select a file.';
        console.error(formError);
        return;
      }
    } else {
      if (connString) {
        details.connection_string = connString;
      } else if (host) {
        details.host = host;
        details.port = Number(port) || 9000;
        details.user = user;
        details.password = password;
        details.database = dbName;
      } else {
        formError = 'For ClickHouse, provide Connection String or Host.';
        console.error(formError);
        return;
      }
    }

    try {
      await connect(details, selectedFile ?? undefined);
    } catch (err) {
      console.error('Connect API call failed:', err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Disconnect API call failed (unexpectedly):', err);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h4" fontWeight={600} gutterBottom>
          Data Source Selection
        </Typography>

        {error && (
          <Alert severity="error" variant="filled">
            {error}
          </Alert>
        )}
        {message && (
          <Alert severity="success" icon={<CloudDoneIcon fontSize="inherit" />}>
            {message}{' '}
            {isConnected ? (
              <Link to="/visualize" style={{ textDecoration: 'underline', marginLeft: 6 }}>
                Go to Visualization
              </Link>
            ) : null}
          </Alert>
        )}

        <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #e0e0e0' }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Connect to a Data Source
              </Typography>
              <FormControl size="small" sx={{ minWidth: 220 }} disabled={isConnected || isLoading}>
                <InputLabel id="connection-type-label">Connection Type</InputLabel>
                <Select
                  labelId="connection-type-label"
                  value={connectionType}
                  label="Connection Type"
                  onChange={(e) => setConnectionType(e.target.value as 'csv' | 'clickhouse')}
                >
                  <MenuItem value="csv">CSV File</MenuItem>
                  <MenuItem value="clickhouse">ClickHouse</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {connectionType === 'csv' && (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  CSV File
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    disabled={isConnected || isLoading}
                  >
                    Choose CSV
                    <input
                      hidden
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                    />
                  </Button>
                  <TextField
                    size="small"
                    label="Selected File"
                    value={filePath}
                    placeholder="No file selected"
                    InputProps={{ readOnly: true }}
                    sx={{ flex: 1, minWidth: 220 }}
                  />
                </Stack>
              </Box>
            )}

            {connectionType === 'clickhouse' && (
              <Stack spacing={3}>
                <LabeledTextField
                  label="Connection String"
                  fullWidth
                  placeholder="clickhouse://user:pass@host:port/db"
                  value={connString}
                  onChange={(e) => setConnString(e.target.value)}
                  disabled={isConnected || isLoading}
                />

                <Divider>OR</Divider>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <LabeledTextField
                    label="Host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    disabled={isConnected || isLoading || !!connString}
                  />
                  <LabeledTextField
                    label="Port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    disabled={isConnected || isLoading || !!connString}
                    sx={{ width: 200 }}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <LabeledTextField
                    label="User"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    disabled={isConnected || isLoading || !!connString}
                  />
                  <LabeledTextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isConnected || isLoading || !!connString}
                  />
                </Stack>

                <LabeledTextField
                  label="Database"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  disabled={isConnected || isLoading || !!connString}
                  sx={{ maxWidth: 360 }}
                />
              </Stack>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1 }}>
              {!isConnected ? (
                <Button onClick={handleConnect} disabled={isLoading} variant="contained">
                  Connect
                </Button>
              ) : (
                <Button onClick={handleDisconnect} disabled={isLoading} variant="outlined" color="secondary">
                  Disconnect
                </Button>
              )}
            </Stack>

            {isLoading && (
              <Typography variant="body2" color="text.secondary">
                Loading...
              </Typography>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}

export default DataSourceSelectionPage;