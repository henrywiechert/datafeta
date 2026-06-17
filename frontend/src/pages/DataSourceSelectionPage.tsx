// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DataSourceSelectionPage - Refactored to use useConnectionForm hook and sub-components.
 * 
 * This page allows users to connect to different data sources:
 * - CSV file upload
 * - ClickHouse database
 * - Kaggle datasets
 */

import React, { useEffect, useMemo, useRef, useState, ChangeEvent } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { Link, useNavigate } from 'react-router-dom';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useConnectionForm } from '../hooks/useConnectionForm';
import {
  CsvConnectionForm,
  ClickHouseConnectionForm,
  KaggleConnectionForm,
  HuggingFaceConnectionForm,
  HiveParquetConnectionForm,
  ConnectionType,
} from '../components/ConnectionForms';
import { readFileAsText } from '../services/configurationService';
import { apiService } from '../apiService';
import { DemoDataset } from '../services/api';
import DataSlicerIcon from '../components/icons/DataSlicerIcon';
import styles from './DataSourceSelectionPage.module.css';

interface DataSourceSelectionPageProps {
  onLoadConfiguration: (config: any, options?: { preserveConnection?: boolean }) => Promise<void>;
  onOpenGallery?: () => void;
}

function DataSourceSelectionPage({ onLoadConfiguration, onOpenGallery }: DataSourceSelectionPageProps) {
  const navigate = useNavigate();
  const { appConfig, isLoading: isAppConfigLoading, isConnectorAllowed } = useAppConfig();
  const [demoDatasets, setDemoDatasets] = useState<DemoDataset[]>([]);
  const [demoDatasetError, setDemoDatasetError] = useState<string | null>(null);
  const {
    isConnected,
    isLoading,
    error,
    message,
    connect,
    connectDemoDataset,
    disconnect,
    connectionDetails,
  } = useConnection();

  const form = useConnectionForm();
  const { syncFromConnectionDetails } = form;
  const { setHivePartitionFiles } = useDataSource();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const connectionOptions = useMemo<Array<{ value: ConnectionType; label: string; unavailable: boolean }>>(() => {
    const options: Array<{ value: ConnectionType; label: string }> = [
      { value: 'csv', label: 'File (CSV, Parquet)' },
      { value: 'hive_parquet', label: 'Hive Parquet (Partitioned)' },
      { value: 'clickhouse', label: 'ClickHouse' },
      { value: 'kaggle', label: 'Kaggle Dataset' },
      { value: 'huggingface', label: 'HuggingFace Dataset' },
    ];
    return options.map((option) => ({
      ...option,
      unavailable: appConfig.isDemoMode
        ? option.value !== 'csv'
        : !isConnectorAllowed(option.value),
    }));
  }, [appConfig.isDemoMode, isConnectorAllowed]);

  const currentConnectorEnabled = (
    !isAppConfigLoading
    && isConnectorAllowed(form.connectionType)
    && (!appConfig.isDemoMode || form.connectionType === 'csv')
  );

  useEffect(() => {
    if (!appConfig.demoDatasets.enabled) {
      setDemoDatasets([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await apiService.listDemoDatasets();
        if (!cancelled) {
          setDemoDatasets(response.datasets);
          setDemoDatasetError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDemoDatasetError(err instanceof Error ? err.message : 'Failed to load demo datasets');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [appConfig.demoDatasets.enabled]);

  // Sync form state when reconnecting (e.g., page refresh while connected)
  useEffect(() => {
    if (isConnected && connectionDetails) {
      syncFromConnectionDetails(connectionDetails);
    }
  }, [isConnected, connectionDetails, syncFromConnectionDetails]);

  const handleConnect = async () => {
    if (!currentConnectorEnabled) {
      return;
    }

    const validation = form.validateForm();
    if (!validation.isValid) {
      console.error(validation.errorMessage);
      return;
    }

    const details = form.buildConnectionDetails();
    try {
      // Pass array of files for file-based connections
      const files = form.csvState.selectedFiles.length > 0 ? form.csvState.selectedFiles : undefined;
      await connect(details, files);
      
      // For Hive Parquet connections, copy partition files to DataSourceContext for lazy loading
      if (details.type === 'hive_parquet' && form.hiveParquetState.partitionFiles.size > 0) {
        setHivePartitionFiles(form.hiveParquetState.partitionFiles);
      }
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

  const handleDemoDatasetConnect = async (dataset: DemoDataset) => {
    try {
      const result = await connectDemoDataset(dataset.id);
      const snapshotId = result.snapshotId || dataset.snapshotId;
      if (snapshotId) {
        const snapshot = await apiService.loadSnapshot(snapshotId);
        if (snapshot.configuration) {
          await onLoadConfiguration(snapshot.configuration, { preserveConnection: true });
        }
      }
      navigate('/visualize');
    } catch (err) {
      console.error('Demo dataset connection failed:', err);
    }
  };

  const handleLoadConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const jsonString = await readFileAsText(file);
      const config = JSON.parse(jsonString);

      // Use the same handler as the Visualization page Load button
      await onLoadConfiguration(config);
    } catch (error: any) {
      console.error('Failed to load configuration:', error);
      alert(
        'Failed to load configuration: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formDisabled = isConnected || isLoading;

  return (
    <div className={styles.container}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); window.location.href = '/'; }}
          className={styles.pageTitle}
          style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', margin: 0 }}
          title="Reload Data Source Selection"
        >
          <DataSlicerIcon style={{ fontSize: '2rem' }} />
          DataSlicer
        </a>
        <a
          href="/help/"
          target="_blank"
          rel="noopener noreferrer"
          title="Open User Manual"
          style={{ color: '#666', display: 'flex', alignItems: 'center', lineHeight: 1 }}
        >
          <span style={{ fontSize: '1.3rem' }}>?</span>
        </a>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Connect to a Data Source</h3>

        {/* Load Configuration Buttons */}
        <div className={styles.loadConfigSection}>
          {onOpenGallery && (
            <button
              className={styles.loadButton}
              onClick={onOpenGallery}
              disabled={formDisabled || appConfig.isDemoMode}
              type="button"
            >
              Saved Configurations...
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleLoadConfig}
            style={{ display: 'none' }}
            id="config-file-input"
          />
          <label htmlFor="config-file-input">
            <button
              className={styles.loadButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={formDisabled}
              type="button"
            >
              Import Config from File...
            </button>
          </label>
        </div>

        {demoDatasets.length > 0 && !isConnected && (
          <div className={styles.loadConfigSection}>
            {demoDatasets.map((dataset) => (
              <button
                key={dataset.id}
                className={styles.loadButton}
                onClick={() => handleDemoDatasetConnect(dataset)}
                disabled={formDisabled}
                type="button"
                title={dataset.description || `${dataset.database}.${dataset.table}`}
              >
                {dataset.label}
              </button>
            ))}
          </div>
        )}
        {demoDatasetError && <div className={styles.errorMessage}>Error: {demoDatasetError}</div>}

        {/* Connection Type Selector */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Data Source Type</label>
          <select
            className={styles.select}
            value={form.connectionType}
            onChange={(e) => form.setConnectionType(e.target.value as ConnectionType)}
            disabled={formDisabled}
          >
            {connectionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}{option.unavailable ? ' (disabled)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Render the appropriate form based on connection type */}
        <div className={!currentConnectorEnabled ? styles.disabledForm : undefined}>
          {form.connectionType === 'csv' && (
            <CsvConnectionForm
              state={form.csvState}
              onUpdate={form.updateCsvState}
              onFileChange={form.handleFileChange}
              disabled={formDisabled || !currentConnectorEnabled}
            />
          )}

          {form.connectionType === 'clickhouse' && (
            <ClickHouseConnectionForm
              state={form.clickHouseState}
              onUpdate={form.updateClickHouseState}
              disabled={formDisabled || !currentConnectorEnabled}
            />
          )}

          {form.connectionType === 'kaggle' && (
            <KaggleConnectionForm
              state={form.kaggleState}
              onUpdate={form.updateKaggleState}
              csvState={form.csvState}
              onCsvUpdate={form.updateCsvState}
              onSearch={form.searchKaggleDatasets}
              onSelectDataset={form.selectKaggleDataset}
              onLoadManual={form.loadKaggleFilesManual}
              disabled={formDisabled || !currentConnectorEnabled}
            />
          )}

          {form.connectionType === 'huggingface' && (
            <HuggingFaceConnectionForm
              state={form.huggingFaceState}
              onUpdate={form.updateHuggingFaceState}
              onSearch={form.searchHuggingFaceDatasets}
              onSelectDataset={form.selectHuggingFaceDataset}
              onLoadManual={form.loadHuggingFaceSplitsManual}
              disabled={formDisabled || !currentConnectorEnabled}
            />
          )}

          {form.connectionType === 'hive_parquet' && (
            <HiveParquetConnectionForm
              state={form.hiveParquetState}
              onUpdate={form.updateHiveParquetState}
              onFolderSelect={form.handleHiveFolderSelect}
              disabled={formDisabled || !currentConnectorEnabled}
              isConnecting={isLoading}
              isConnected={isConnected}
            />
          )}
        </div>

        {/* Connect/Disconnect Buttons */}
        <div className={styles.buttonContainer}>
          {!isConnected ? (
            <button
              className={styles.button}
              onClick={handleConnect}
              disabled={isLoading || !currentConnectorEnabled}
            >
              Connect
            </button>
          ) : (
            <button
              className={`${styles.button} ${styles.disconnectButton}`}
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Status Messages */}
        <div className={styles.messageContainer}>
          {isLoading && <div className={styles.loadingText}>Connecting...</div>}
          {error && <div className={styles.errorMessage}>Error: {error}</div>}
          {message && (
            <div className={styles.successMessage}>
              {message}{' '}
              {isConnected ? <Link to="/visualize">Go to Visualization</Link> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataSourceSelectionPage;
