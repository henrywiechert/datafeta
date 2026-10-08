// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * CsvConnectionForm - File upload with advanced parsing options.
 * Accepts every registered file format (AppConfig.fileFormats), optionally
 * compressed, with multi-file upload capability. Which options are shown
 * follows the option groups the selected formats declare.
 */

import React, { ChangeEvent, useMemo } from 'react';
import { CsvFormState } from './types';
import { CsvParsingOptionsSection } from './CsvParsingOptionsSection';
import styles from '../../pages/DataSourceSelectionPage.module.css';
import { useFileFormats } from '../../contexts/AppConfigContext';
import {
  dataFileAccept,
  fileFormatFor,
  formatLabelList,
  isZipArchive,
  selectionUsesOption,
} from '../../utils/uploadFileTypes';

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
  const formats = useFileFormats();
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      // Convert FileList to array
      onFileChange(Array.from(event.target.files));
    } else {
      onFileChange(null);
    }
  };

  // Option groups the selection may use (a zip may hold any format, so it counts too).
  const showCsvOptions = useMemo(
    () => selectionUsesOption(state.selectedFiles, formats, 'csv'),
    [state.selectedFiles, formats]
  );

  // Selected non-CSV formats that also use the date formats (e.g. Excel text dates).
  const dateFormatTargets = useMemo(() => {
    const labels = state.selectedFiles
      .map((file) => fileFormatFor(file.name, formats))
      .filter((format) => format && format.options.includes('date_formats') && !format.options.includes('csv'))
      .map((format) => format!.label);
    return Array.from(new Set(labels));
  }, [state.selectedFiles, formats]);

  // Format file summary
  const fileSummary = useMemo(() => {
    const count = state.selectedFiles.length;
    if (count === 0) return null;
    if (count === 1) return state.fileNames[0];

    const counts = new Map<string, number>();
    for (const file of state.selectedFiles) {
      const label = isZipArchive(file.name)
        ? 'ZIP'
        : fileFormatFor(file.name, formats)?.label ?? 'other';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    // Registered formats first, in catalog order, then ZIP / other.
    const order = [...formats.map((format) => format.label), 'ZIP', 'other'];
    const parts = order
      .filter((label) => counts.has(label))
      .map((label) => `${counts.get(label)} ${label}`);

    return `${count} files (${parts.join(', ')})`;
  }, [state.selectedFiles, state.fileNames, formats]);

  const formatsText = formatLabelList(formats);

  return (
    <div className={styles.formGroup}>
      <div className={styles.fileUpload}>
        <label className={styles.label}>
          Data Files ({formatsText ? `${formatsText}; ` : ''}may be compressed)
        </label>
        <input
          type="file"
          accept={dataFileAccept(formats)}
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

      {/* Parsing options the selected formats declare */}
      {(showCsvOptions || dateFormatTargets.length > 0) && (
        <CsvParsingOptionsSection
          state={state}
          onUpdate={onUpdate}
          disabled={disabled}
          showCsvOptions={showCsvOptions}
          dateFormatTargets={dateFormatTargets}
        />
      )}
    </div>
  );
}

