import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { apiService } from '../apiService';
import { Database, Table, Column } from '../types';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Container,
  CircularProgress,
  Alert,
  Link,
  SelectChangeEvent
} from '@mui/material';

// Import the new components
import DataSourcePanel from '../components/Visualization/DataSourcePanel';
import DropZones from '../components/Visualization/DropZones';
import ChartArea from '../components/Visualization/ChartArea';
import styles from './VisualizationPage.module.css'; // Import styles

function VisualizationPage() {
  // Get connection state from context
  const { isConnected, connectionDetails, isLoading: isConnectionLoading } = useConnection();

  // State for metadata and selections specific to this page
  const [databases, setDatabases] = useState<Database[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>(''); // Store name
  const [selectedTable, setSelectedTable] = useState<string>(''); // Store name

  // Loading/Error state for metadata fetching on this page
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Effect to load initial data based on connection type
  useEffect(() => {
    if (isConnected && connectionDetails) {
      // Clear previous state when connection changes
      setDatabases([]);
      setTables([]);
      setColumns([]);
      setSelectedDatabase('');
      setSelectedTable('');
      setMetadataError(null);

      if (connectionDetails.type === 'clickhouse') {
        // Load databases for ClickHouse
        fetchDatabases();
      } else if (connectionDetails.type === 'csv') {
        // Load the single table for CSV
        fetchTables(); // No database needed
      }
    }
  // Depend on connectionDetails to refetch if connection info changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, connectionDetails]);

  // Effect to load columns when a table is selected
  useEffect(() => {
    if (selectedTable) {
        // For ClickHouse, selectedDatabase must also be set
        if (connectionDetails?.type === 'clickhouse' && !selectedDatabase) {
            return; // Wait for database selection
        }
        fetchColumns();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]); // Re-run when selectedTable changes

  // --- Data Fetching Functions --- //

  const fetchDatabases = async () => {
    setIsLoadingMetadata(true);
    setMetadataError(null);
    try {
      const response = await apiService.listDatabases();
      setDatabases(response.databases || []);
    } catch (err: any) {
      setMetadataError(err.message || 'Failed to load databases');
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const fetchTables = async (databaseName?: string) => {
    // Use provided name or state; defaults to undefined if not provided and state is empty
    const targetDatabase = databaseName ?? (selectedDatabase || undefined);

    // Validation already happened in the calling effect/handler for ClickHouse
    setIsLoadingMetadata(true);
    setMetadataError(null);
    setTables([]); // Clear previous tables
    setColumns([]); // Clear previous columns
    setSelectedTable(''); // Clear table selection

    try {
      const response = await apiService.listTables(targetDatabase);
      setTables(response.tables || []);

      // Auto-select table if CSV (only one table expected)
      if (connectionDetails?.type === 'csv' && response.tables?.length === 1) {
         setSelectedTable(response.tables[0].name);
      }

    } catch (err: any) {
      setMetadataError(err.message || 'Failed to load tables');
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const fetchColumns = async () => {
    // Table must be selected
    if (!selectedTable) return;
    // For ClickHouse, database must be selected
    if (connectionDetails?.type === 'clickhouse' && !selectedDatabase) return;

    setIsLoadingMetadata(true);
    setMetadataError(null);
    setColumns([]); // Clear previous columns

    try {
      // Pass selectedDatabase only for ClickHouse
      const dbParam = connectionDetails?.type === 'clickhouse' ? selectedDatabase : undefined;
      const response = await apiService.listColumns(selectedTable, dbParam);
      setColumns(response.columns || []);
    } catch (err: any) {
      setMetadataError(err.message || 'Failed to load columns');
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  // --- UI Event Handlers --- //

  const handleDatabaseSelect = (event: SelectChangeEvent<string>) => {
    const dbName = event.target.value;
    setSelectedDatabase(dbName);
    // Reset downstream selections
    setSelectedTable('');
    setTables([]);
    setColumns([]);
    // Fetch tables for the newly selected database
    fetchTables(dbName);
  };

  const handleTableSelect = (event: SelectChangeEvent<string>) => {
    const tableName = event.target.value;
    setSelectedTable(tableName);
    // Columns will be fetched by the useEffect hook watching selectedTable
  };

  // --- Render Logic --- //

  if (isConnectionLoading) {
    return (
      <Container className={styles.loadingContainer}>
        <CircularProgress />
        <Typography variant="body1" className={styles.loadingText}>Checking connection status...</Typography>
      </Container>
    );
  }

  if (!isConnected) {
    return (
      <Container className={styles.notConnectedContainer}>
        <Typography variant="h4" gutterBottom>Visualization</Typography>
        <Alert severity="warning" className={styles.notConnectedAlert}>No active data source connection.</Alert>
        <Link component={RouterLink} to="/" variant="button">
          Connect to a Data Source
        </Link>
      </Container>
    );
  }

  // Connected state:
  return (
    <Container maxWidth="xl" className={styles.pageContainer}>
      <Typography variant="h4" gutterBottom>Visualization</Typography>
      <Typography variant="subtitle1" gutterBottom>
        Connected to: {connectionDetails?.type} {connectionDetails?.type === 'csv' ? `(File: ${connectionDetails.file_path?.split('/').pop()})` : `(${connectionDetails?.host || connectionDetails?.connection_string})`}
      </Typography>

      <Box className={styles.mainLayoutBox}>
        {/* === Left Panel: Use DataSourcePanel Component === */}
        <Box className={styles.leftPanelBox} sx={{ width: { xs: '100%', md: '300px' } }}>
          <DataSourcePanel
            connectionType={connectionDetails?.type}
            databases={databases}
            tables={tables}
            columns={columns}
            selectedDatabase={selectedDatabase}
            selectedTable={selectedTable}
            onDatabaseSelect={handleDatabaseSelect}
            onTableSelect={handleTableSelect}
            isLoading={isLoadingMetadata}
            error={metadataError}
          />
        </Box>

        {/* === Right Area: Use DropZones and ChartArea Components === */}
        <Box className={styles.rightPanelBox}>
          <DropZones />
          <ChartArea />
        </Box>
      </Box>
    </Container>
  );
}

export default VisualizationPage; 