// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * CsvConnectionForm - File upload with advanced CSV configuration options.
 * Supports both CSV and Parquet files, with multi-file upload capability.
 */

import React, { ChangeEvent, useMemo } from 'react';
import { CsvFormState } from './types';
import { CsvParsingOptionsSection } from './CsvParsingOptionsSection';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface CsvConnectionFormProps {
  state: CsvFormState;
  onUpdate: (updates: Partial<CsvFormState>) => void;
  onFileChange: (files: File[] | null) => void;
  disabled: boolean;
}

export function CsvConnectionForm({
  state,
  onUpdate,
  onFileChange,
  disabled,
}: CsvConnectionFormProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      // Convert FileList to array
      onFileChange(Array.from(event.target.files));
    } else {
      onFileChange(null);
    }
  };

  const JSON_EXTENSIONS = ['.json', '.ndjson', '.jsonl'];

  // Check if any CSV files are selected (to show CSV-specific options)
  const hasCsvFiles = useMemo(() => {
    return state.selectedFiles.some((file) => file.name.toLowerCase().endsWith('.csv'));
  }, [state.selectedFiles]);

  // Format file summary
  const fileSummary = useMemo(() => {
    const count = state.selectedFiles.length;
    if (count === 0) return null;
    if (count === 1) return state.fileNames[0];

    const csvCount = state.selectedFiles.filter((f) => f.name.toLowerCase().endsWith('.csv')).length;
    const jsonCount = state.selectedFiles.filter((f) =>
      JSON_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    ).length;
    const parquetCount = count - csvCount - jsonCount;

    const parts = [];
    if (csvCount > 0) parts.push(`${csvCount} CSV`);
    if (parquetCount > 0) parts.push(`${parquetCount} Parquet`);
    if (jsonCount > 0) parts.push(`${jsonCount} JSON`);

    return `${count} files (${parts.join(', ')})`;
  }, [state.selectedFiles, state.fileNames]);

  return (
    <div className={styles.formGroup}>
      <div className={styles.fileUpload}>
        <label className={styles.label}>Data Files (CSV, Parquet or JSON)</label>
        <input
          type="file"
          accept=".csv,.parquet,.json,.ndjson,.jsonl"
          multiple
          onChange={handleFileChange}
          disabled={disabled}
          className={styles.input}
        />
        {fileSummary && (
          <div className={styles.selectedFile}>Selected: {fileSummary}</div>
        )}
        {state.fileNames.length > 1 && (
          <div className={styles.fileList}>
            {state.fileNames.map((name, idx) => (
              <div key={idx} className={styles.fileListItem}>
                {name}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSV Configuration Options - only shown when CSV files are selected */}
      {hasCsvFiles && (
        <CsvParsingOptionsSection state={state} onUpdate={onUpdate} disabled={disabled} />
      )}
    </div>
  );
}

