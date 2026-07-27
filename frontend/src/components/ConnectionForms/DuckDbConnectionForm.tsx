// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DuckDbConnectionForm - Absolute path to a local DuckDB database file.
 */

import React from 'react';
import { DuckDbFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface DuckDbConnectionFormProps {
  state: DuckDbFormState;
  onUpdate: (updates: Partial<DuckDbFormState>) => void;
  disabled: boolean;
}

export function DuckDbConnectionForm({
  state,
  onUpdate,
  disabled,
}: DuckDbConnectionFormProps) {
  return (
    <div className={styles.fieldsSection}>
      <div className={styles.formField}>
        <label className={styles.label}>Database Path</label>
        <input
          className={`${styles.input} ${styles.inputWide}`}
          type="text"
          value={state.databasePath}
          onChange={(e) => onUpdate({ databasePath: e.target.value })}
          placeholder="/absolute/path/to/database.duckdb"
          disabled={disabled}
        />
        <p style={{ marginTop: 8, fontSize: '0.85rem', opacity: 0.8 }}>
          Absolute path to a DuckDB database file visible to the backend process.
          In Docker, mount the file (or its directory) into the container first.
        </p>
      </div>
    </div>
  );
}
