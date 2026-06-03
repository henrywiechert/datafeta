// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * KaggleConnectionForm - Credentials + search/manual mode + dataset/file selection.
 */

import React from 'react';
import { CsvFormState, KaggleFormState } from './types';
import { CsvParsingOptionsSection } from './CsvParsingOptionsSection';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface KaggleConnectionFormProps {
  state: KaggleFormState;
  onUpdate: (updates: Partial<KaggleFormState>) => void;
  csvState: CsvFormState;
  onCsvUpdate: (updates: Partial<CsvFormState>) => void;
  onSearch: () => Promise<void>;
  onSelectDataset: (ref: string) => Promise<void>;
  onLoadManual: () => Promise<void>;
  disabled: boolean;
}

export function KaggleConnectionForm({
  state,
  onUpdate,
  csvState,
  onCsvUpdate,
  onSearch,
  onSelectDataset,
  onLoadManual,
  disabled,
}: KaggleConnectionFormProps) {
  const handleModeToggle = (manualMode: boolean) => {
    onUpdate({
      manualMode,
      searchError: '',
      datasets: [],
      selectedDataset: '',
      files: [],
    });
  };

  return (
    <div className={styles.formGroup}>
      <div className={styles.kaggleSection}>
        <div className={styles.formField}>
          <label className={styles.label}>Kaggle Username</label>
          <input
            className={styles.input}
            type="text"
            value={state.username}
            onChange={(e) => onUpdate({ username: e.target.value })}
            placeholder="Your Kaggle username"
            disabled={disabled}
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.label}>Kaggle API Key</label>
          <input
            className={styles.input}
            type="password"
            value={state.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="Your Kaggle API key"
            disabled={disabled}
          />
          <small style={{ color: '#666', fontSize: '0.85em' }}>
            Get your API key from{' '}
            <a
              href="https://www.kaggle.com/settings/account"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kaggle Account Settings
            </a>
          </small>
        </div>

        <div className={styles.formField}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '8px',
            }}
          >
            <label className={styles.label} style={{ margin: 0 }}>
              Dataset Selection Mode
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                fontSize: '0.9em',
              }}
            >
              <input
                type="checkbox"
                checked={state.manualMode}
                onChange={(e) => handleModeToggle(e.target.checked)}
                disabled={disabled}
                style={{ marginRight: '6px' }}
              />
              Manual Entry
            </label>
          </div>
        </div>

        {!state.manualMode ? (
          <div className={styles.formField}>
            <label className={styles.label}>Search Public Datasets</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className={styles.input}
                type="text"
                value={state.searchQuery}
                onChange={(e) => onUpdate({ searchQuery: e.target.value })}
                placeholder="e.g., penguin, covid sales, or amulyas/penguin-size-dataset"
                disabled={disabled || state.isSearching}
                style={{ flex: 1 }}
              />
              <button
                className={styles.button}
                onClick={onSearch}
                disabled={
                  disabled || state.isSearching || !state.username || !state.apiKey
                }
                style={{ minWidth: '100px' }}
              >
                {state.isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Search by keywords or enter exact dataset (owner/dataset-name). Returns up
              to 200 results. Leave empty to browse recent datasets.
            </div>
          </div>
        ) : (
          <div className={styles.formField}>
            <label className={styles.label}>Dataset Reference</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className={styles.input}
                type="text"
                value={state.manualDataset}
                onChange={(e) => onUpdate({ manualDataset: e.target.value })}
                placeholder="owner/dataset-name (e.g., karnikakapoor/satellite-orbital-catalog)"
                disabled={disabled}
                style={{ flex: 1 }}
              />
              <button
                className={styles.button}
                onClick={onLoadManual}
                disabled={
                  disabled || !state.username || !state.apiKey || !state.manualDataset
                }
                style={{ minWidth: '100px' }}
              >
                Load Files
              </button>
            </div>
            <small
              style={{
                color: '#666',
                fontSize: '0.85em',
                display: 'block',
                marginTop: '4px',
              }}
            >
              Find the dataset on{' '}
              <a
                href="https://www.kaggle.com/datasets"
                target="_blank"
                rel="noopener noreferrer"
              >
                Kaggle
              </a>{' '}
              and copy the owner/dataset-name from the URL
            </small>
          </div>
        )}

        {state.searchError && (
          <div className={styles.errorMessage}>{state.searchError}</div>
        )}

        {state.datasets.length > 0 && (
          <div className={styles.formField}>
            <label className={styles.label}>
              Select Dataset ({state.datasets.length} found)
            </label>
            <div
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              {state.datasets.map((dataset) => (
                <div
                  key={dataset.ref}
                  onClick={() => onSelectDataset(dataset.ref)}
                  style={{
                    padding: '10px',
                    cursor: 'pointer',
                    backgroundColor:
                      state.selectedDataset === dataset.ref ? '#e3f2fd' : 'white',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{dataset.title}</div>
                  <div style={{ fontSize: '0.85em', color: '#666' }}>
                    {dataset.ref} • {dataset.size_mb} MB
                    {dataset.csv_file_count !== null &&
                    dataset.csv_file_count !== undefined
                      ? ` • ${dataset.csv_file_count} CSV files`
                      : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.files.length > 0 && (
          <div className={styles.formField}>
            <label className={styles.label}>Select CSV File</label>
            <select
              className={styles.select}
              value={state.selectedFile}
              onChange={(e) => onUpdate({ selectedFile: e.target.value })}
              disabled={disabled}
            >
              <option value="">-- Select a file --</option>
              {state.files.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name} ({file.size_mb} MB)
                </option>
              ))}
            </select>
          </div>
        )}

        {state.selectedDataset && (
          <CsvParsingOptionsSection
            state={csvState}
            onUpdate={onCsvUpdate}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

