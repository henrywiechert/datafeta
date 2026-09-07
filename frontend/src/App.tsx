// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, Tab, Box, IconButton, Tooltip, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Typography, Snackbar, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { SheetProvider, useSheetContext } from './contexts/SheetContext';
import { useDataSource } from './contexts/DataSourceContext';
import { useConnection } from './contexts/ConnectionContext';
import { useDataSourceVersionSync } from './hooks/useSheetRenderCache';
import { useSheetManagement } from './hooks/useSheetManagement';
import { sheetRenderCacheStore } from './stores';
import SaveLoadMenu from './components/SaveLoadMenu';
import ConnectionRestoreDialog, { ClickHouseOverrides, ConnectionRestoreOptions } from './components/ConnectionRestoreDialog';
import SnapshotGalleryDialog from './components/SnapshotGalleryDialog';
import SnapshotSaveAsDialog from './components/SnapshotSaveAsDialog';
import { 
  exportConfiguration, 
  saveConfigFile, 
  validateConfiguration,
  reconstructConnectionDetails 
} from './services/configurationService';
import { apiService } from './apiService';
import { SavedConfiguration, SavedConnectionMetadata, SnapshotMetadata } from './types';
import { useCurrentSnapshot, CurrentSnapshotIdentity } from './hooks/useCurrentSnapshot';
import { rewriteUnionTablesForDatabase } from './utils/schemaValidation';
import { resolveSnapshotDatabaseOverride } from './utils/snapshotDatabaseOverride';
import { schemaCheckBus } from './services/schemaCheckBus';
import { useAppConfig } from './contexts/AppConfigContext';
import './App.css';

const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { appConfig, isLoading: isAppConfigLoading } = useAppConfig();
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
    setJoinedTables,
    setVirtualColumns,
    setVirtualColumnFieldPreferences,
    setFieldAlias,
    setCustomRelationships,
    loadHivePartition,
    restoreSessionFilters,
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
  
  // --- Sheet management extracted to a dedicated hook ---
  const sheetManagement = useSheetManagement({
    addSheet,
    renameSheet,
    duplicateSheet,
    removeSheet,
    setActiveSheet,
    sheets: state.sheets,
    navigate,
    isVisualizationPage,
  });

  // Destructure sheet management for use in JSX
  const {
    contextMenu,
    openSheetMenu,
    closeContextMenu: handleCloseContextMenu,
    renameDialog,
    newName,
    setNewName,
    closeRenameDialog,
    handleTabChange,
    handleAddSheet,
    handleContextMenu,
    handleRenameClick,
    handleRenameConfirm,
    handleDuplicateClick,
    handleDeleteClick,
  } = sheetManagement;
  
  // State for configuration restore
  const [pendingConfig, setPendingConfig] = useState<SavedConfiguration | null>(null);
  const [showConnectionRestore, setShowConnectionRestore] = useState(false);
  const [connectionMetadata, setConnectionMetadata] = useState<SavedConnectionMetadata | null>(null);
  const [databaseOverride, setDatabaseOverride] = useState<string | null>(null);
  
  // State for snapshot gallery
  const [showSnapshotGallery, setShowSnapshotGallery] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);

  // Identity of the snapshot open in the workspace, so "Save" can update it in
  // place instead of making the user re-pick it in the gallery.
  const currentSnapshot = useCurrentSnapshot();
  const { clear: clearCurrentSnapshot } = currentSnapshot;

  // Transient Save feedback (there is no app-wide toast host).
  const [saveStatus, setSaveStatus] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  // Load snapshot from URL parameter on mount
  const snapshotLoadedRef = React.useRef(false);
  useEffect(() => {
    if (isAppConfigLoading) return;
    const snapshotId = searchParams.get('snapshot');
    if (snapshotId && !appConfig.snapshots.enabled) {
      setSearchParams({});
      return;
    }
    if (snapshotId && !snapshotLoadedRef.current) {
      snapshotLoadedRef.current = true;
      const databaseParam = searchParams.get('database');
      console.log('Loading snapshot from URL:', snapshotId);
      
      // Load the snapshot asynchronously
      (async () => {
        try {
          const snapshot = await apiService.loadSnapshot(snapshotId);
          if (snapshot.configuration) {
            const overrideResult = resolveSnapshotDatabaseOverride(
              snapshot.configuration,
              databaseParam,
            );
            if (!overrideResult.applied && overrideResult.reason) {
              alert(overrideResult.reason);
            }
            handleLoadConfiguration(snapshot.configuration, {
              databaseOverride: overrideResult.applied ? overrideResult.database : undefined,
              snapshotIdentity: {
                id: snapshot.id,
                name: snapshot.name,
                folder: snapshot.folder ?? '',
              },
            });
          }
        } catch (err) {
          console.error('Failed to load snapshot from URL:', err);
          alert('Failed to load shared configuration: ' + (err instanceof Error ? err.message : 'Snapshot not found'));
          // Clear the invalid snapshot parameter
          setSearchParams({});
        }
      })();
    }
  // REASON: snapshot URL is read once when config finishes loading; setSearchParams and handleLoadConfiguration are stable enough that re-running on their identity would re-trigger the dialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppConfigLoading, appConfig.snapshots.enabled]);

  // Warn before an accidental page reload would lose work: either unsaved edits
  // to the open configuration, or an active connection that would be dropped.
  // Skip in Electron — the desktop shell owns quit via the window close button.
  useEffect(() => {
    const isElectron = /Electron/i.test(navigator.userAgent);
    if (isElectron) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentSnapshot.isDirty || isConnected) {
        // Standard way to trigger the browser's "Leave site?" dialog
        e.preventDefault();
        // Chrome requires returnValue to be set (even if empty string)
        e.returnValue = '';
        // Some older browsers use the return value as the message
        return currentSnapshot.isDirty
          ? 'You have unsaved changes to this configuration. Are you sure you want to leave?'
          : 'You have an active connection. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isConnected, currentSnapshot.isDirty]);

  // Reset workspace on page load if not connected
  // This prevents stale visualization state from persisting after page reload
  const initialLoadRef = React.useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      // On initial load, if not connected, reset the workspace to clear stale state
      if (!isConnected) {
        resetWorkspace();
        clearCurrentSnapshot();
      }
    }
  }, [isConnected, resetWorkspace, clearCurrentSnapshot]);

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
      hivePartitionInfo,
      dataSource.sessionFilterFields,
      dataSource.sessionAppliedFilterConfigurations,
      dataSource.customRelationships,
    );
  };

  // getCurrentConfiguration closes over this render's state, so deferred
  // callers (timeouts, event listeners) must go through a ref or they would
  // read a stale configuration.
  const getConfigRef = React.useRef(getCurrentConfiguration);
  useEffect(() => {
    getConfigRef.current = getCurrentConfiguration;
  });

  // Re-check for unsaved edits whenever anything the configuration captures
  // changes. state.sheets only changes once per 300ms debounce, so this is
  // event-driven rather than polling.
  useEffect(() => {
    currentSnapshot.recomputeDirty(getConfigRef.current());
  // REASON: deps mirror the values getCurrentConfiguration reads; the function
  // itself is recreated every render and would make this run continuously.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.sheets,
    state.activeSheetId,
    state.nextSheetNumber,
    connectionDetails,
    dataSource.selectedDatabase,
    dataSource.selectedTable,
    dataSource.unionTables,
    dataSource.virtualTable,
    dataSource.virtualColumns,
    dataSource.virtualColumnFieldPreferences,
    dataSource.fieldDisplayAliases,
    dataSource.loadedPartitions,
    dataSource.sessionFilterFields,
    dataSource.sessionAppliedFilterConfigurations,
    dataSource.customRelationships,
    currentSnapshot.recomputeDirty,
  ]);

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

  // Update the open snapshot in place. With nothing open there is no name to
  // save under, so fall through to Save As rather than inventing one.
  const handleSaveSnapshot = async () => {
    if (!currentSnapshot.current) {
      setShowSaveAs(true);
      return;
    }
    try {
      const config = getCurrentConfiguration();
      const meta = await apiService.overwriteSnapshot(currentSnapshot.current.id, config);
      currentSnapshot.adopt(meta);
      currentSnapshot.markSaved(config);
      setSaveStatus({ severity: 'success', message: `Saved "${meta.name}"` });
    } catch (error) {
      console.error('Failed to save snapshot:', error);
      setSaveStatus({
        severity: 'error',
        message: 'Failed to save: ' + (error instanceof Error ? error.message : 'Unknown error'),
      });
    }
  };

  // Always creates a new snapshot, then continues working against that one.
  const handleSaveAs = async (name: string, folder: string) => {
    const config = getCurrentConfiguration();
    const meta = await apiService.saveSnapshot(name, config, folder || undefined);
    currentSnapshot.adopt(meta);
    currentSnapshot.markSaved(config);
    setSearchParams({ snapshot: meta.id });
    setSaveStatus({ severity: 'success', message: `Saved "${meta.name}"` });
  };

  const canSaveToServer = appConfig.snapshots.enabled && appConfig.snapshots.writable;

  // Ctrl/Cmd+S saves the open configuration. Registered here rather than
  // alongside the undo/redo shortcuts in VisualizationPage because the save
  // handlers live in this component and there is no context bridge between them.
  const handleSaveRef = React.useRef(handleSaveSnapshot);
  useEffect(() => {
    handleSaveRef.current = handleSaveSnapshot;
  });
  useEffect(() => {
    if (!canSaveToServer) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierKey || event.key.toLowerCase() !== 's' || event.shiftKey || event.altKey) return;

      // Don't hijack the shortcut while the user is editing text.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Suppress the browser's "Save Page As" dialog.
      event.preventDefault();
      handleSaveRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSaveToServer]);

  // Handle loading from snapshot gallery
  const handleLoadFromGallery = (config: SavedConfiguration, meta?: SnapshotMetadata) => {
    handleLoadConfiguration(config, {
      snapshotIdentity: meta && { id: meta.id, name: meta.name, folder: meta.folder ?? '' },
    });
  };

  const handleLoadConfiguration = async (
    rawConfig: any,
    options?: {
      preserveConnection?: boolean;
      databaseOverride?: string;
      /**
       * Set when the config came from a named server snapshot, so Save can
       * update it in place. Omitted by file import and demo-dataset loads:
       * those leave the workspace untitled on purpose — a demo snapshot is a
       * shared template that Save must not overwrite for everyone.
       */
      snapshotIdentity?: CurrentSnapshotIdentity;
    },
  ) => {
    try {
      // Check if currently connected - warn user before proceeding
      if (isConnected && !options?.preserveConnection) {
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
      setDatabaseOverride(options?.databaseOverride ?? null);

      // Past the cancel guard, so the workspace really is being replaced: take
      // on the new identity, or become untitled when there isn't one. The URL
      // follows the identity so sharing and reloading stay in agreement — it
      // must not move to a snapshot the user declined to load above.
      if (options?.snapshotIdentity) {
        currentSnapshot.adopt(options.snapshotIdentity);
        // Skipped when already on this snapshot, which keeps a ?database=
        // override intact on the shared-URL load path.
        if (searchParams.get('snapshot') !== options.snapshotIdentity.id) {
          setSearchParams({ snapshot: options.snapshotIdentity.id });
        }
      } else {
        currentSnapshot.clear();
        // Drop a stale ?snapshot= so a reload doesn't resurrect the old config.
        if (searchParams.get('snapshot')) setSearchParams({});
      }
      
      // If there's connection metadata, show the connection restore dialog
      if (config.connection && !options?.preserveConnection) {
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
    hiveFileStructure?: string[],
    restoreOptions?: ConnectionRestoreOptions,
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
        const swapDatabase =
          restoreOptions?.swapSameSchema && connectionMetadata.type === 'clickhouse'
            ? (clickHouseOverrides?.database || connectionMetadata.database || '')
            : undefined;
        restoreConfigurationState(pendingConfig, {
          swapDatabase: swapDatabase || undefined,
          requestSchemaCheck: restoreOptions?.swapSameSchema,
        });

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
    setDatabaseOverride(null);
  };

  const handleConnectionRestoreSkip = () => {
    if (pendingConfig) {
      setShowConnectionRestore(false);
      setDatabaseOverride(null);
      restoreConfigurationState(pendingConfig);
    }
  };

  const restoreConfigurationState = (
    config: SavedConfiguration,
    options?: { swapDatabase?: string; requestSchemaCheck?: boolean },
  ) => {
    try {
      if (options?.requestSchemaCheck) {
        schemaCheckBus.requestAfterLoad();
      }
      // Restore sheets
      sheetDispatch({ type: 'LOAD_SHEETS', payload: config.sheets });
      
      // Restore active sheet if specified
      if (config.activeSheetId) {
        setActiveSheet(config.activeSheetId);
      }

      // Restore session (global) filters if present
      if (config.sessionFilters && config.sessionFilters.fields.length > 0) {
        restoreSessionFilters(config.sessionFilters.fields, config.sessionFilters.configurations);
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
            const savedDatabase = config.dataSource!.selectedDatabase;
            const targetDatabase = options?.swapDatabase || savedDatabase;

            if (targetDatabase) {
              setSelectedDatabase(targetDatabase);
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
              const unionTables = options?.swapDatabase
                ? rewriteUnionTablesForDatabase(
                    config.dataSource!.unionTables,
                    savedDatabase,
                    options.swapDatabase,
                  )
                : config.dataSource!.unionTables;
              setUnionTables(unionTables);
            }
            // Restore joined tables if present
            if (config.dataSource!.joinedTables && config.dataSource!.joinedTables.length > 0) {
              // Restore joinedTables string[] so useEffect sees them as joined
              const joinedTableNames = config.dataSource!.joinedTables.map(jt => jt.table_name);
              setJoinedTables(joinedTableNames);
              // Recreate the virtual table with join mode
              setVirtualTable({
                primary_table: config.dataSource!.selectedTable,
                mode: 'join',
                joined_tables: config.dataSource!.joinedTables,
                union_tables: [],
              });
            }
            // Restore custom relationships if present (manual FK mode)
            if (config.dataSource!.customRelationships) {
              setCustomRelationships(config.dataSource!.customRelationships);
            }
            // Note: measureGroupFields is now per-sheet, restored via sheet state above
          }, 0);
        });
      }
      if (config.dataSource && connectionType === 'csv') {
        setVirtualColumns(config.dataSource.virtualColumns ?? []);
        setVirtualColumnFieldPreferences(config.dataSource.virtualColumnFieldPreferences ?? {});
        if (options?.requestSchemaCheck && config.dataSource.selectedTable) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              setSelectedTable(config.dataSource!.selectedTable);
            }, 0);
          });
        }
        // Note: measureGroupFields is now per-sheet, restored via sheet state above
      }
      // For CSV without swap: Don't restore table — let the natural useEffect flow handle it

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
      setDatabaseOverride(null);

      // Capture the dirty baseline only once the restored state has settled.
      // Visualization state reaches state.sheets via a 300ms debounce (see
      // useVisualizationState), so measuring now would read the *previous*
      // config and show a freshly loaded snapshot as already modified.
      window.setTimeout(() => {
        currentSnapshot.markSaved(getConfigRef.current());
      }, 600);
    } catch (error) {
      console.error('Failed to restore configuration state:', error);
      alert('Failed to restore configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Determine current tab value
  const currentTab = isDataSourcePage ? 'datasources' : state.activeSheetId;
  const activeSheet = state.sheets.find((sheet) => sheet.id === state.activeSheetId) ?? null;

  return (
    <div className="App">
      {/* Main content area */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<DataSourceSelectionPage onLoadConfiguration={handleLoadConfiguration} onOpenGallery={appConfig.snapshots.enabled ? () => setShowSnapshotGallery(true) : undefined} />} />
            <Route
              path="/visualize"
              element={
                isConnected
                  ? <VisualizationPage />
                  : <Navigate to="/" replace />
              }
            />
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
              label={sheet.name}
              onContextMenu={(event) => handleContextMenu(event, sheet.id)}
              onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openSheetMenu(sheet.id, rect.left, rect.bottom);
                }
              }}
              sx={{
                '&.Mui-selected': {
                  fontWeight: 600,
                },
                textTransform: 'none',
              }}
            />
          ))}
        </Tabs>
        {activeSheet && currentTab !== 'datasources' && (
          <Tooltip title={`Sheet actions for ${activeSheet.name}`}>
            <IconButton
              aria-label={`Sheet actions for ${activeSheet.name}`}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openSheetMenu(activeSheet.id, rect.left, rect.bottom);
              }}
              size="small"
              sx={{ ml: 0.5 }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
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
          {currentSnapshot.current && (
            <Tooltip title={currentSnapshot.isDirty ? 'Unsaved changes' : 'Saved configuration'}>
              <Typography
                variant="caption"
                noWrap
                sx={{ maxWidth: 260, color: 'text.secondary' }}
              >
                {currentSnapshot.isDirty ? '• ' : ''}
                {currentSnapshot.current.folder
                  ? `${currentSnapshot.current.folder} / ${currentSnapshot.current.name}`
                  : currentSnapshot.current.name}
              </Typography>
            </Tooltip>
          )}
          <SaveLoadMenu
            onExportFile={handleSaveConfiguration}
            onLoad={handleLoadConfiguration}
            onOpenGallery={appConfig.snapshots.enabled ? () => setShowSnapshotGallery(true) : undefined}
            onSave={canSaveToServer ? handleSaveSnapshot : undefined}
            onSaveAs={canSaveToServer ? () => setShowSaveAs(true) : undefined}
            serverStorageReadable={!appConfig.isDemoMode}
            serverStorageWritable={appConfig.snapshots.writable}
          />
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
        onClose={closeRenameDialog}
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
          <Button onClick={closeRenameDialog}>
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
        databaseOverride={databaseOverride}
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
        onSaveAsNew={handleSaveAs}
        currentSnapshotId={currentSnapshot.current?.id}
        readOnly={!appConfig.snapshots.writable}
      />

      <SnapshotSaveAsDialog
        open={showSaveAs}
        onClose={() => setShowSaveAs(false)}
        onSave={handleSaveAs}
        initialName={currentSnapshot.current?.name ?? ''}
        initialFolder={currentSnapshot.current?.folder ?? ''}
      />

      <Snackbar
        open={Boolean(saveStatus)}
        autoHideDuration={2000}
        onClose={() => setSaveStatus(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {saveStatus ? (
          <Alert severity={saveStatus.severity} variant="filled" onClose={() => setSaveStatus(null)}>
            {saveStatus.message}
          </Alert>
        ) : undefined}
      </Snackbar>
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
