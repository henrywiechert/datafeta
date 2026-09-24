// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * CsvConnectionForm - File upload with advanced CSV configuration options.
 * Supports CSV, Parquet and JSON files (optionally compressed), with multi-file upload capability.
 */

import React, { ChangeEvent, useMemo } from 'react';
import { CsvFormState } from './types';
import { CsvParsingOptionsSection } from './CsvParsingOptionsSection';
import styles from '../../pages/DataSourceSelectionPage.module.css';
import { DATA_FILE_ACCEPT, isZipArchive, stripCompressionSuffix } from '../../utils/uploadFileTypes';

interface CsvConnectionFormProps {
  state: CsvFormState;
  onUpdate: (updates: Partial<CsvFormState>) => void;
  onFileChange: (files: File[] | null) => void;
  disabled: boolean;
}

const JSON_EXTENSIONS = ['.json', '.ndjson', '.jsonl'];

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

  // Check if any CSV files are selected (to show CSV-specific options).
  // A zip may hold CSVs, so it counts too.
  const hasCsvFiles = useMemo(() => {
    return state.selectedFiles.some(
      (file) => isZipArchive(file.name) || stripCompressionSuffix(file.name).endsWith('.csv')
    );
  }, [state.selectedFiles]);

  // Format file summary
  const fileSummary = useMemo(() => {
    const count = state.selectedFiles.length;
    if (count === 0) return null;
    if (count === 1) return state.fileNames[0];

    const names = state.selectedFiles.map((f) => f.name);
    const zipCount = names.filter(isZipArchive).length;
    const innerNames = names.filter((n) => !isZipArchive(n)).map(stripCompressionSuffix);
    const csvCount = innerNames.filter((n) => n.endsWith('.csv')).length;
    const jsonCount = innerNames.filter((n) =>
      JSON_EXTENSIONS.some((ext) => n.endsWith(ext))
    ).length;
    const parquetCount = innerNames.length - csvCount - jsonCount;

    const parts = [];
    if (csvCount > 0) parts.push(`${csvCount} CSV`);
    if (parquetCount > 0) parts.push(`${parquetCount} Parquet`);
    if (jsonCount > 0) parts.push(`${jsonCount} JSON`);
    if (zipCount > 0) parts.push(`${zipCount} ZIP`);

    return `${count} files (${parts.join(', ')})`;
  }, [state.selectedFiles, state.fileNames]);

  return (
    <div className={styles.formGroup}>
      <div className={styles.fileUpload}>
        <label className={styles.label}>Data Files (CSV, Parquet or JSON; may be compressed)</label>
        <input
          type="file"
          accept={DATA_FILE_ACCEPT}
          multiple
          onChange={handleFileChange}
          disabled={disabled}
          className={styles.input}
        />
        {fileSummary && (
          <div className={styles.selectedFile}>Selected: {fileSummary}</div>
        )}
        <div className={styles.demoHint}>
          Compressed files (.gz, .bz2, .xz, .zst) are decompressed on upload; name them
          like data.csv.gz. Each supported file in a .zip becomes its own table.
        </div>
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

