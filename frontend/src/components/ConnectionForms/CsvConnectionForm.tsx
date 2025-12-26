/**
 * CsvConnectionForm - File upload with advanced CSV configuration options.
 */

import React, { ChangeEvent } from 'react';
import { CsvFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface CsvConnectionFormProps {
  state: CsvFormState;
  onUpdate: (updates: Partial<CsvFormState>) => void;
  onFileChange: (file: File | null) => void;
  disabled: boolean;
}

export function CsvConnectionForm({
  state,
  onUpdate,
  onFileChange,
  disabled,
}: CsvConnectionFormProps) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onFileChange(event.target.files[0]);
    } else {
      onFileChange(null);
    }
  };

  return (
    <div className={styles.formGroup}>
      <div className={styles.fileUpload}>
        <label className={styles.label}>CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={disabled}
          className={styles.input}
        />
        {state.filePath && (
          <div className={styles.selectedFile}>Selected: {state.filePath}</div>
        )}
      </div>

      {/* CSV Configuration Options */}
      <div className={styles.csvConfigSection}>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => onUpdate({ showAdvancedOptions: !state.showAdvancedOptions })}
          disabled={disabled}
        >
          {state.showAdvancedOptions ? '▼' : '▶'} Advanced CSV Options
        </button>

        {state.showAdvancedOptions && (
          <div className={styles.advancedOptions}>
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.label}>Delimiter</label>
                <select
                  className={styles.select}
                  value={state.delimiter}
                  onChange={(e) => onUpdate({ delimiter: e.target.value })}
                  disabled={disabled}
                >
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="\t">Tab</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Header Row</label>
                <select
                  className={styles.select}
                  value={state.hasHeader ? 'true' : 'false'}
                  onChange={(e) => onUpdate({ hasHeader: e.target.value === 'true' })}
                  disabled={disabled}
                >
                  <option value="true">Yes (first line)</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.label}>Decimal Separator</label>
                <select
                  className={styles.select}
                  value={state.decimalSeparator}
                  onChange={(e) => onUpdate({ decimalSeparator: e.target.value })}
                  disabled={disabled}
                >
                  <option value=".">Period (.) - e.g., 1234.56</option>
                  <option value=",">Comma (,) - e.g., 1234,56</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Thousands Separator</label>
                <select
                  className={styles.select}
                  value={state.thousandsSeparator}
                  onChange={(e) => onUpdate({ thousandsSeparator: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">None - e.g., 1234567</option>
                  <option value="comma">Comma (,) - e.g., 1,234,567</option>
                  <option value="space">Space - e.g., 1 234 567</option>
                  <option value="apostrophe">Apostrophe (') - e.g., 1'234'567</option>
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.label}>Date Format</label>
                <select
                  className={styles.select}
                  value={state.dateFormat}
                  onChange={(e) => onUpdate({ dateFormat: e.target.value })}
                  disabled={disabled}
                >
                  <option value="%Y-%m-%d">YYYY-MM-DD (2024-10-17)</option>
                  <option value="%d.%m.%Y">DD.MM.YYYY (17.10.2024)</option>
                  <option value="%m.%d.%Y">MM.DD.YYYY (10.17.2024)</option>
                  <option value="%m/%d/%Y">MM/DD/YYYY (10/17/2024)</option>
                  <option value="%d/%m/%Y">DD/MM/YYYY (17/10/2024)</option>
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Timestamp Format</label>
                <select
                  className={styles.select}
                  value={state.timestampFormat}
                  onChange={(e) => onUpdate({ timestampFormat: e.target.value })}
                  disabled={disabled}
                >
                  <option value="%Y-%m-%d %H:%M:%S">YYYY-MM-DD HH:MM:SS</option>
                  <option value="%d.%m.%Y %H:%M:%S">DD.MM.YYYY HH:MM:SS</option>
                  <option value="%m.%d.%Y %H:%M:%S">MM.DD.YYYY HH:MM:SS</option>
                  <option value="%m/%d/%Y %H:%M:%S">MM/DD/YYYY HH:MM:SS</option>
                  <option value="%d/%m/%Y %H:%M:%S">DD/MM/YYYY HH:MM:SS</option>
                  <option value="%Y-%m-%d %H:%M">YYYY-MM-DD HH:MM</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

