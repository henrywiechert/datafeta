// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * SqliteConnectionForm - Upload a SQLite database file.
 * A single file contains the whole schema, so every table (and view) in it
 * becomes queryable and declared foreign keys are used for joins.
 */

import React, { ChangeEvent } from 'react';
import { SqliteFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface SqliteConnectionFormProps {
  state: SqliteFormState;
  onFileChange: (file: File | null) => void;
  disabled: boolean;
}

export function SqliteConnectionForm({
  state,
  onFileChange,
  disabled,
}: SqliteConnectionFormProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFileChange(event.target.files?.[0] ?? null);
  };

  return (
    <div className={styles.formGroup}>
      <div className={styles.fileUpload}>
        <label className={styles.label}>SQLite Database File (.sqlite, .sqlite3, .db)</label>
        <input
          type="file"
          accept=".sqlite,.sqlite3,.db"
          onChange={handleFileChange}
          disabled={disabled}
          className={styles.input}
        />
        {state.fileName && (
          <div className={styles.selectedFile}>Selected: {state.fileName}</div>
        )}
        <div className={styles.demoHint}>
          All tables and views in the file become queryable. The file is opened
          read-only and is never modified.
        </div>
      </div>
    </div>
  );
}
