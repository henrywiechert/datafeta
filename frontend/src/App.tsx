import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, Tab, Box, IconButton, Tooltip, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { SheetProvider, useSheetContext } from './contexts/SheetContext';
import { useDataSource } from './contexts/DataSourceContext';
import { useConnection } from './contexts/ConnectionContext';
import { useDataSourceVersionSync } from './hooks/useSheetRenderCache';
import { sheetRenderCacheStore } from './stores';
import SaveLoadMenu from './components/SaveLoadMenu';
import ConnectionRestoreDialog, { ClickHouseOverrides } from './components/ConnectionRestoreDialog';
import SnapshotGalleryDialog from './components/SnapshotGalleryDialog';
import VersionDisplay from './components/VersionDisplay';
import { 
  exportConfiguration, 
  saveConfigFile, 
  validateConfiguration,
  reconstructConnectionDetails 
} from './services/configurationService';
import { apiService } from './apiService';
import { SavedConfiguration, SavedConnectionMetadata } from './types';
import './App.css';

const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDataSourcePage = location.pathname === '/';
  const isVisualizationPage = location.pathname.startsWith('/visualize');
  
  const { state, setActiveSheet, addSheet, renameSheet, duplicateSheet, removeSheet, resetWorkspace, dispatch: sheetDispatch } = useSheetContext();
  const {
    dataSource,
    setSelectedDatabase,
    setSelectedTable,
    setDatabases,
    setTables,
    setAvailableFields,
    setUnionTables,
    setVirtualTable,
    setVirtualColumns,
    setVirtualColumnFieldPreferences,
    setFieldAlias,
    loadHivePartition,
  } = useDataSource();
  const { connectionDetails, connect, disconnect, isConnected } = useConnection();
  
  // Track data source version for sheet render cache invalidation
  // When any of these change, all sheet caches become invalid
  // Note: measureGroupFields is now per-sheet, so it doesn't invalidate other sheets' caches
  useDataSourceVersionSync({
    selectedDatabase: dataSource.selectedDatabase,
    selectedTable: dataSource.selectedTable,
    virtualColumnsLength: dataSource.virtualColumns?.length ?? 0,
    joinedTablesLength: dataSource.joinedTables?.length ?? 0,
    unionTablesLength: dataSource.unionTables?.length ?? 0,
  });
  
  // Invalidate all sheet caches on disconnect
  useEffect(() => {
    if (!isConnected) {
      sheetRenderCacheStore.invalidateAll();
    }
  }, [isConnected]);
  
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    sheetId: string;
  } | null>(null);
  
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    sheetId: string;
    currentName: string;
  }>({ open: false, sheetId: '', currentName: '' });
  
  const [newName, setNewName] = useState('');
  
  // State for configuration restore
  const [pendingConfig, setPendingConfig] = useState<SavedConfiguration | null>(null);
  const [showConnectionRestore, setShowConnectionRestore] = useState(false);
  const [connectionMetadata, setConnectionMetadata] = useState<SavedConnectionMetadata | null>(null);
  
  // State for snapshot gallery
  const [showSnapshotGallery, setShowSnapshotGallery] = useState(false);
  
  // State for tracking loaded snapshot (for URL sharing)
  const [loadedSnapshotId, setLoadedSnapshotId] = useState<string | null>(null);

  // Load snapshot from URL parameter on mount
  const snapshotLoadedRef = React.useRef(false);
  useEffect(() => {
    const snapshotId = searchParams.get('snapshot');
    if (snapshotId && !snapshotLoadedRef.current) {
      snapshotLoadedRef.current = true;
      console.log('Loading snapshot from URL:', snapshotId);
      
      // Load the snapshot asynchronously
      (async () => {
        try {
          const snapshot = await apiService.loadSnapshot(snapshotId);
          if (snapshot.configuration) {
            setLoadedSnapshotId(snapshotId);
            handleLoadConfiguration(snapshot.configuration);
          }
        } catch (err) {
          console.error('Failed to load snapshot from URL:', err);
          alert('Failed to load shared configuration: ' + (err instanceof Error ? err.message : 'Snapshot not found'));
          // Clear the invalid snapshot parameter
          setSearchParams({});
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Warn user before accidental page reload when connected
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isConnected) {
        // Standard way to trigger the browser's "Leave site?" dialog
        e.preventDefault();
        // Chrome requires returnValue to be set (even if empty string)
        e.returnValue = '';
        // Some older browsers use the return value as the message
        return 'You have an active connection. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isConnected]);

  // Reset workspace on page load if not connected
  // This prevents stale visualization state from persisting after page reload
  const initialLoadRef = React.useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      // On initial load, if not connected, reset the workspace to clear stale state
      if (!isConnected) {
        resetWorkspace();
      }
    }
  }, [isConnected, resetWorkspace]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    if (newValue === 'datasources') {
      navigate('/');
    } else {
      // It's a sheet ID
      setActiveSheet(newValue);
      // Only navigate if we're not already on the visualization page
      if (!isVisualizationPage) {
        navigate('/visualize');
      }
    }
  };

  const handleAddSheet = (event: React.MouseEvent) => {
    event.stopPropagation();
    addSheet();
    if (!isVisualizationPage) {
      navigate('/visualize');
    }
  };

  const handleContextMenu = (event: React.MouseEvent, sheetId: string, sheetName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      sheetId,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleRenameClick = () => {
    if (contextMenu) {
      const sheet = state.sheets.find(s => s.id === contextMenu.sheetId);
      if (sheet) {
        setNewName(sheet.name);
        setRenameDialog({
          open: true,
          sheetId: contextMenu.sheetId,
          currentName: sheet.name,
        });
      }
    }
    handleCloseContextMenu();
  };

  const handleRenameConfirm = () => {
    if (newName.trim() && renameDialog.sheetId) {
      renameSheet(renameDialog.sheetId, newName.trim());
    }
    setRenameDialog({ open: false, sheetId: '', currentName: '' });
    setNewName('');
  };

  const handleDuplicateClick = () => {
    if (contextMenu) {
      duplicateSheet(contextMenu.sheetId);
    }
    handleCloseContextMenu();
  };

  const handleDeleteClick = () => {
    if (contextMenu && state.sheets.length > 1) {
      removeSheet(contextMenu.sheetId);
    }
    handleCloseContextMenu();
  };

  // Helper to get current configuration
  const getCurrentConfiguration = (): SavedConfiguration => {
    // Build hive partition info if connected to a hive_parquet source
    const hivePartitionInfo = connectionDetails?.type === 'hive_parquet' ? {
      loadedPartitions: Array.from(dataSource.loadedPartitions),
      primaryPartition: dataSource.selectedTable,
      unionPartitions: dataSource.unionTables.map(t => t.table_name),
    } : undefined;

    return exportConfiguration(
      state.sheets,
      state.activeSheetId,
      state.nextSheetNumber,
      connectionDetails,
      dataSource.selectedDatabase,
      dataSource.selectedTable,
      dataSource.unionTables,
      dataSource.virtualTable?.joined_tables,
      dataSource.virtualColumns,
      dataSource.virtualColumnFieldPreferences,
      dataSource.fieldDisplayAliases,
      hivePartitionInfo
    );
  };

  // Save/Load Configuration Handlers
  const handleSaveConfiguration = async () => {
    try {
      // Note: measureGroupFields is now per-sheet (stored in each sheet's visualizationState)
      // so it's automatically saved via state.sheets
      const config = getCurrentConfiguration();
      await saveConfigFile(config);
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('Failed to save configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Quick save to server with auto-generated name
  const handleQuickSave = async () => {
    try {
      const config = getCurrentConfiguration();
      const timestamp = new Date().toLocaleString();
      const name = `Snapshot ${timestamp}`;
      await apiService.saveSnapshot(name, config);
    } catch (error) {
      console.error('Failed to quick save:', error);
      alert('Failed to save to server: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Handle loading from snapshot gallery
  const handleLoadFromGallery = (config: SavedConfiguration, snapshotId?: string) => {
    if (snapshotId) {
      setLoadedSnapshotId(snapshotId);
      // Update URL with snapshot ID for sharing
      setSearchParams({ snapshot: snapshotId });
    }
    handleLoadConfiguration(config);
  };

  const handleLoadConfiguration = async (rawConfig: any) => {
    try {
      // Check if currently connected - warn user before proceeding
      if (isConnected) {
        const confirmed = window.confirm(
          'You are currently connected to a data source. Loading this configuration will disconnect you first. Continue?'
        );
        if (!confirmed) {
          return; // User cancelled
        }
        
        // Disconnect from current connection
        try {
          await disconnect();
        } catch (err) {
          console.error('Failed to disconnect before loading configuration:', err);
          // Continue anyway - validation will handle errors
        }
      }
      
      // Validate the configuration
      const config = validateConfiguration(rawConfig);
      
      // If there's connection metadata, show the connection restore dialog
      if (config.connection) {
        setPendingConfig(config);
        setConnectionMetadata(config.connection);
        setShowConnectionRestore(true);
      } else {
        // No connection, just restore sheets and data source selection
        restoreConfigurationState(config);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      alert('Failed to load configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleConnectionRestore = async (
    password: string,
    files?: File[],
    kaggleUsername?: string,
    kaggleApiKey?: string,
    clickHouseOverrides?: ClickHouseOverrides,
    hivePartitionFiles?: Map<string, File[]>,
    hiveFileStructure?: string[]
  ) => {
    if (!connectionMetadata || !pendingConfig) return;

    try {
      if (connectionMetadata.type === 'hive_parquet') {
        // Hive Parquet: two-phase connection restore
        // Use the fresh file structure from the folder picker (paths may differ from saved snapshot)
        const details = reconstructConnectionDetails(connectionMetadata);
        if (hiveFileStructure && hiveFileStructure.length > 0) {
          details.hive_file_structure = hiveFileStructure;
        }
        await connect(details); // Phase 1: connect with hive_file_structure

        // Phase 2: Load partitions with user-provided files
        if (hivePartitionFiles && connectionMetadata.hive_loaded_partitions) {
          const primaryPartition = connectionMetadata.hive_primary_partition;
          const unionPartitions = connectionMetadata.hive_union_partitions || [];

          // Load primary partition first
          if (primaryPartition) {
            const primaryFiles = hivePartitionFiles.get(primaryPartition);
            if (primaryFiles && primaryFiles.length > 0) {
              await loadHivePartition(primaryPartition, true, primaryFiles);
            }
          }

          // Load union partitions
          for (const unionPartition of unionPartitions) {
            const unionFiles = hivePartitionFiles.get(unionPartition);
            if (unionFiles && unionFiles.length > 0) {
              await loadHivePartition(unionPartition, false, unionFiles);
            }
          }
        }

        setShowConnectionRestore(false);
        restoreConfigurationState(pendingConfig);

        if (!isVisualizationPage) {
          navigate('/visualize');
        }
      } else {
        // Existing flow for CSV, ClickHouse, Kaggle
        const details = reconstructConnectionDetails(
          connectionMetadata,
          password,
          kaggleUsername,
          kaggleApiKey,
          clickHouseOverrides
        );

        // Attempt to connect (pass files array for multi-file support)
        await connect(details, files);

        // If connection successful, restore the rest of the configuration
        setShowConnectionRestore(false);
        restoreConfigurationState(pendingConfig);

        // Navigate to visualization page if not already there
        if (!isVisualizationPage) {
          navigate('/visualize');
        }
      }
    } catch (error) {
      // Error is handled by the ConnectionRestoreDialog
      throw error;
    }
  };

  const handleConnectionRestoreCancel = () => {
    setShowConnectionRestore(false);
    setPendingConfig(null);
    setConnectionMetadata(null);
  };

  const handleConnectionRestoreSkip = () => {
    if (pendingConfig) {
      setShowConnectionRestore(false);
      restoreConfigurationState(pendingConfig);
    }
  };

  const restoreConfigurationState = (config: SavedConfiguration) => {
    try {
      // Restore sheets
      sheetDispatch({ type: 'LOAD_SHEETS', payload: config.sheets });
      
      // Restore active sheet if specified
      if (config.activeSheetId) {
        setActiveSheet(config.activeSheetId);
      }
      
      // Navigate to visualization page first if we have sheets
      // This ensures the visualization page hooks are mounted before we restore data source
      if (config.sheets.length > 0 && !isVisualizationPage) {
        navigate('/visualize');
      }
      
      // Restore data source selection after navigation
      // Give React time to mount the visualization page and its hooks
      // Note: Use config.connection.type instead of connectionDetails?.type because
      // connectionDetails state might not be updated yet (React batches state updates)
      const connectionType = config.connection?.type;
      
      if (config.dataSource && connectionType !== 'csv' && connectionType !== 'hive_parquet') {
        // For ClickHouse/Kaggle: restore database and table selection
        // Use requestAnimationFrame to wait for next render cycle
        requestAnimationFrame(() => {
          setTimeout(() => {
            
            // Clear metadata arrays first to ensure useEffects trigger fetches
            setDatabases([]);
            setTables([]);
            setAvailableFields([]);
            
            // Then set the restored database and table
            // The useEffects in useVisualizationState will detect these changes
            // and fetch the appropriate metadata (databases -> tables -> columns)
            if (config.dataSource!.selectedDatabase) {
              setSelectedDatabase(config.dataSource!.selectedDatabase);
            }
            if (config.dataSource!.selectedTable) {
              setSelectedTable(config.dataSource!.selectedTable);
            }
            if (config.dataSource!.virtualColumns) {
              setVirtualColumns(config.dataSource!.virtualColumns);
            } else {
              setVirtualColumns([]);
            }
            if (config.dataSource!.virtualColumnFieldPreferences) {
              setVirtualColumnFieldPreferences(config.dataSource!.virtualColumnFieldPreferences);
            } else {
              setVirtualColumnFieldPreferences({});
            }
            // Restore field display aliases if present
            if (config.dataSource!.fieldDisplayAliases) {
              // Set aliases one by one using the context method
              Object.entries(config.dataSource!.fieldDisplayAliases).forEach(([columnName, alias]) => {
                setFieldAlias(columnName, alias);
              });
            }
            // Restore union tables if present
            if (config.dataSource!.unionTables && config.dataSource!.unionTables.length > 0) {
              setUnionTables(config.dataSource!.unionTables);
            }
            // Restore joined tables if present
            if (config.dataSource!.joinedTables && config.dataSource!.joinedTables.length > 0) {
              // Recreate the virtual table with join mode
              setVirtualTable({
                primary_table: config.dataSource!.selectedTable,
                mode: 'join',
                joined_tables: config.dataSource!.joinedTables,
                union_tables: [],
              });
            }
            // Note: measureGroupFields is now per-sheet, restored via sheet state above
          }, 0);
        });
      }
      if (config.dataSource && connectionType === 'csv') {
        setVirtualColumns(config.dataSource.virtualColumns ?? []);
        setVirtualColumnFieldPreferences(config.dataSource.virtualColumnFieldPreferences ?? {});
        // Note: measureGroupFields is now per-sheet, restored via sheet state above
      }
      // For CSV: Don't restore anything - let the natural useEffect flow handle it
      // The fetchTables will auto-detect and select the single table

      if (config.dataSource && connectionType === 'hive_parquet') {
        // For Hive Parquet: partition loading in handleConnectionRestore already set
        // selectedTable, availableFields, and unionTables. Just restore virtual columns/preferences.
        setVirtualColumns(config.dataSource.virtualColumns ?? []);
        setVirtualColumnFieldPreferences(config.dataSource.virtualColumnFieldPreferences ?? {});
        if (config.dataSource.fieldDisplayAliases) {
          Object.entries(config.dataSource.fieldDisplayAliases).forEach(([columnName, alias]) => {
            setFieldAlias(columnName, alias);
          });
        }
      }
      
      setPendingConfig(null);
      setConnectionMetadata(null);
    } catch (error) {
      console.error('Failed to restore configuration state:', error);
      alert('Failed to restore configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Determine current tab value
  const currentTab = isDataSourcePage ? 'datasources' : state.activeSheetId;

  return (
    <div className="App">
      {/* Main content area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<DataSourceSelectionPage onLoadConfiguration={handleLoadConfiguration} onOpenGallery={() => setShowSnapshotGallery(true)} />} />
            <Route path="/visualize" element={<VisualizationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Box>

      {/* Bottom tabs - Data Sources + Sheet Tabs */}
      <Box sx={{ 
        borderTop: 1, 
        borderColor: 'divider', 
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.paper'
      }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          indicatorColor="secondary"
          textColor="secondary"
          aria-label="Data Slicer navigation"
          className="compact-tabs"
          sx={{ flexGrow: 0 }}
        >
          <Tab label="Data Sources" value="datasources" sx={{ textTransform: 'none' }} />
          {state.sheets.map((sheet) => (
            <Tab
              key={sheet.id}
              value={sheet.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{sheet.name}</span>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContextMenu(e, sheet.id, sheet.name);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    sx={{ ml: 0.5, p: 0.25 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{
                '&.Mui-selected': {
                  fontWeight: 600,
                },
                textTransform: 'none',
              }}
            />
          ))}
        </Tabs>
        <Tooltip title="Add new sheet">
          <IconButton 
            onClick={handleAddSheet} 
            size="small" 
            sx={{ 
              ml: 0.5,
              minWidth: 40,
              height: 40,
              borderRadius: 1,
            }}
            color="primary"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', pr: 2 }}>
          <SaveLoadMenu
            onSave={handleSaveConfiguration}
            onLoad={handleLoadConfiguration}
            onOpenGallery={() => setShowSnapshotGallery(true)}
            onQuickSave={handleQuickSave}
          />
          <VersionDisplay />
        </Box>
      </Box>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleRenameClick}>Rename</MenuItem>
        <MenuItem onClick={handleDuplicateClick}>Duplicate</MenuItem>
        <MenuItem
          onClick={handleDeleteClick}
          disabled={state.sheets.length === 1}
        >
          Delete {state.sheets.length === 1 && '(Last sheet)'}
        </MenuItem>
      </Menu>

      {/* Rename Dialog */}
      <Dialog 
        open={renameDialog.open} 
        onClose={() => setRenameDialog({ open: false, sheetId: '', currentName: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Sheet</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Sheet Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameConfirm();
              }
            }}
            placeholder="Enter sheet name"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog({ open: false, sheetId: '', currentName: '' })}>
            Cancel
          </Button>
          <Button 
            onClick={handleRenameConfirm} 
            variant="contained"
            disabled={!newName.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Connection Restore Dialog */}
      <ConnectionRestoreDialog
        open={showConnectionRestore}
        connectionMetadata={connectionMetadata}
        onConnect={handleConnectionRestore}
        onCancel={handleConnectionRestoreCancel}
        onSkip={handleConnectionRestoreSkip}
      />

      {/* Snapshot Gallery Dialog */}
      <SnapshotGalleryDialog
        open={showSnapshotGallery}
        onClose={() => setShowSnapshotGallery(false)}
        onLoad={handleLoadFromGallery}
        getCurrentConfiguration={getCurrentConfiguration}
      />
    </div>
  );
}

function App() {
  // Note: DataSourceProvider is now at the root level in index.tsx
  // This ensures ConnectionContext can access DataSourceContext
  return (
    <Router>
      <SheetProvider>
        <AppContent />
      </SheetProvider>
    </Router>
  );
}

export default App;
