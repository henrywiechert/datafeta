// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DataSourceSelectionPage - Refactored to use useConnectionForm hook and sub-components.
 * 
 * This page allows users to connect to different data sources:
 * - CSV file upload
 * - ClickHouse database
 * - Kaggle datasets
 */

import React, { useEffect, useRef, ChangeEvent } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useDataSource } from '../contexts/DataSourceContext';
import { Link } from 'react-router-dom';
import { useConnectionForm } from '../hooks/useConnectionForm';
import {
  CsvConnectionForm,
  ClickHouseConnectionForm,
  KaggleConnectionForm,
  HiveParquetConnectionForm,
  ConnectionType,
} from '../components/ConnectionForms';
import { readFileAsText } from '../services/configurationService';
import DataSlicerIcon from '../components/icons/DataSlicerIcon';
import styles from './DataSourceSelectionPage.module.css';

interface DataSourceSelectionPageProps {
  onLoadConfiguration: (config: any) => Promise<void>;
  onOpenGallery?: () => void;
}

function DataSourceSelectionPage({ onLoadConfiguration, onOpenGallery }: DataSourceSelectionPageProps) {
  const {
    isConnected,
    isLoading,
    error,
    message,
    connect,
    disconnect,
    connectionDetails,
  } = useConnection();

  const form = useConnectionForm();
  const { setHivePartitionFiles } = useDataSource();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync form state when reconnecting (e.g., page refresh while connected)
  useEffect(() => {
    if (isConnected && connectionDetails) {
      form.syncFromConnectionDetails(connectionDetails);
    }
    // Only run when connection state changes, not on every form update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, connectionDetails]);

  const handleConnect = async () => {
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
              disabled={formDisabled}
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

        {/* Connection Type Selector */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Data Source Type</label>
          <select
            className={styles.select}
            value={form.connectionType}
            onChange={(e) => form.setConnectionType(e.target.value as ConnectionType)}
            disabled={formDisabled}
          >
            <option value="csv">File (CSV, Parquet)</option>
            <option value="hive_parquet">Hive Parquet (Partitioned)</option>
            <option value="clickhouse">ClickHouse</option>
            <option value="kaggle">Kaggle Dataset</option>
          </select>
        </div>

        {/* Render the appropriate form based on connection type */}
        {form.connectionType === 'csv' && (
          <CsvConnectionForm
            state={form.csvState}
            onUpdate={form.updateCsvState}
            onFileChange={form.handleFileChange}
            disabled={formDisabled}
          />
        )}

        {form.connectionType === 'clickhouse' && (
          <ClickHouseConnectionForm
            state={form.clickHouseState}
            onUpdate={form.updateClickHouseState}
            disabled={formDisabled}
          />
        )}

        {form.connectionType === 'kaggle' && (
          <KaggleConnectionForm
            state={form.kaggleState}
            onUpdate={form.updateKaggleState}
            onSearch={form.searchKaggleDatasets}
            onSelectDataset={form.selectKaggleDataset}
            onLoadManual={form.loadKaggleFilesManual}
            disabled={formDisabled}
          />
        )}

        {form.connectionType === 'hive_parquet' && (
          <HiveParquetConnectionForm
            state={form.hiveParquetState}
            onUpdate={form.updateHiveParquetState}
            onFolderSelect={form.handleHiveFolderSelect}
            disabled={formDisabled}
            isConnecting={isLoading}
            isConnected={isConnected}
          />
        )}

        {/* Connect/Disconnect Buttons */}
        <div className={styles.buttonContainer}>
          {!isConnected ? (
            <button
              className={styles.button}
              onClick={handleConnect}
              disabled={isLoading}
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
