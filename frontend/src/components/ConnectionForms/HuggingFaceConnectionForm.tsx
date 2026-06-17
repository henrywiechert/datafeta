// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * HuggingFaceConnectionForm - Optional token + search/manual mode + split selection.
 */

import React from 'react';
import { HuggingFaceFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface HuggingFaceConnectionFormProps {
  state: HuggingFaceFormState;
  onUpdate: (updates: Partial<HuggingFaceFormState>) => void;
  onSearch: () => Promise<void>;
  onSelectDataset: (ref: string) => Promise<void>;
  onLoadManual: () => Promise<void>;
  disabled: boolean;
}

export function HuggingFaceConnectionForm({
  state,
  onUpdate,
  onSearch,
  onSelectDataset,
  onLoadManual,
  disabled,
}: HuggingFaceConnectionFormProps) {
  const handleModeToggle = (manualMode: boolean) => {
    onUpdate({
      manualMode,
      searchError: '',
      datasets: [],
      selectedDataset: '',
      splits: [],
      selectedSplits: [],
    });
  };

  const handleSplitToggle = (tableName: string, checked: boolean) => {
    const selected = new Set(state.selectedSplits);
    if (checked) {
      selected.add(tableName);
    } else {
      selected.delete(tableName);
    }
    onUpdate({ selectedSplits: Array.from(selected) });
  };

  const selectableSplits = state.splits.filter((split) => !split.is_too_large);
  const allSelectableSelected = (
    selectableSplits.length > 0
    && selectableSplits.every((split) => state.selectedSplits.includes(split.table_name))
  );

  return (
    <div className={styles.formGroup}>
      <div className={styles.kaggleSection}>
        <div className={styles.formField}>
          <label className={styles.label}>HuggingFace Token (optional)</label>
          <input
            className={styles.input}
            type="password"
            value={state.token}
            onChange={(e) => onUpdate({ token: e.target.value })}
            placeholder="hf_... for private or gated datasets"
            disabled={disabled}
          />
          <small style={{ color: '#666', fontSize: '0.85em' }}>
            Public datasets do not require a token. Create tokens in{' '}
            <a
              href="https://huggingface.co/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
            >
              HuggingFace settings
            </a>
            .
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
            <label className={styles.label}>Search Datasets</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className={styles.input}
                type="text"
                value={state.searchQuery}
                onChange={(e) => onUpdate({ searchQuery: e.target.value })}
                placeholder="e.g., penguin, finance, or nyu-mll/glue"
                disabled={disabled || state.isSearching}
                style={{ flex: 1 }}
              />
              <button
                className={styles.button}
                onClick={onSearch}
                disabled={disabled || state.isSearching}
                style={{ minWidth: '100px' }}
              >
                {state.isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Search by keywords or enter exact dataset (owner/dataset-name).
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
                placeholder="owner/dataset-name (e.g., nyu-mll/glue)"
                disabled={disabled}
                style={{ flex: 1 }}
              />
              <button
                className={styles.button}
                onClick={onLoadManual}
                disabled={disabled || !state.manualDataset}
                style={{ minWidth: '100px' }}
              >
                Load Splits
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
              Copy the owner/dataset-name from a dataset URL on{' '}
              <a
                href="https://huggingface.co/datasets"
                target="_blank"
                rel="noopener noreferrer"
              >
                HuggingFace Datasets
              </a>
              .
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
                    {dataset.num_rows ? ` • ${dataset.num_rows.toLocaleString()} rows` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.splits.length > 0 && (
          <div className={styles.formField}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label className={styles.label} style={{ margin: 0 }}>
                Select Splits
              </label>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9em' }}>
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={(e) => onUpdate({
                    selectedSplits: e.target.checked
                      ? selectableSplits.map((split) => split.table_name)
                      : [],
                  })}
                  disabled={disabled || selectableSplits.length === 0}
                  style={{ marginRight: '6px' }}
                />
                Select all allowed
              </label>
            </div>
            <div
              style={{
                marginTop: '8px',
                maxHeight: '180px',
                overflowY: 'auto',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              {state.splits.map((split) => (
                <label
                  key={split.table_name}
                  style={{
                    display: 'block',
                    padding: '8px 10px',
                    borderBottom: '1px solid #eee',
                    color: split.is_too_large ? '#999' : 'inherit',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={state.selectedSplits.includes(split.table_name)}
                    onChange={(e) => handleSplitToggle(split.table_name, e.target.checked)}
                    disabled={disabled || split.is_too_large}
                    style={{ marginRight: '8px' }}
                  />
                  <strong>{split.table_name}</strong>
                  <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '6px' }}>
                    {split.config}/{split.split} • {split.size_mb} MB
                    {split.num_rows ? ` • ${split.num_rows.toLocaleString()} rows` : ''}
                    {split.is_too_large ? ' • too large' : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
