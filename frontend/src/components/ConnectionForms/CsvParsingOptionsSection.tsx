// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared advanced CSV parsing options (delimiter, date formats, sample size).
 * Used by file upload and Kaggle connection forms.
 */

import React from 'react';
import { CsvFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface CsvParsingOptionsSectionProps {
  state: CsvFormState;
  onUpdate: (updates: Partial<CsvFormState>) => void;
  disabled: boolean;
}

export function CsvParsingOptionsSection({
  state,
  onUpdate,
  disabled,
}: CsvParsingOptionsSectionProps) {
  return (
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

          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Type Inference Sample Size</label>
              <input
                type="number"
                min="1"
                step="1"
                className={styles.input}
                value={state.sampleSize}
                onChange={(e) => onUpdate({ sampleSize: e.target.value })}
                disabled={disabled || state.sampleFullDataset}
              />
              <div className={styles.helpText}>
                Number of rows DuckDB samples while detecting CSV column types.
              </div>
            </div>
            <div className={styles.formField}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={state.sampleFullDataset}
                  onChange={(e) => onUpdate({ sampleFullDataset: e.target.checked })}
                  disabled={disabled}
                />
                Full Dataset (can take longer)
              </label>
              <div className={styles.helpText}>
                Reads the whole CSV for type inference, improving accuracy when later rows differ.
              </div>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={state.trimNumericWhitespace}
                  onChange={(e) => onUpdate({ trimNumericWhitespace: e.target.checked })}
                  disabled={disabled}
                />
                Fix trailing whitespace in numeric columns
              </label>
              <div className={styles.helpText}>
                Opt-in repair for values like "123.5 ". May scan VARCHAR columns and can take longer on large CSV files.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
