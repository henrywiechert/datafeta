/**
 * ClickHouseConnectionForm - Connection string OR host/port/user/pass fields.
 */

import React from 'react';
import { ClickHouseFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface ClickHouseConnectionFormProps {
  state: ClickHouseFormState;
  onUpdate: (updates: Partial<ClickHouseFormState>) => void;
  disabled: boolean;
}

export function ClickHouseConnectionForm({
  state,
  onUpdate,
  disabled,
}: ClickHouseConnectionFormProps) {
  // Fields are disabled if a connection string is provided
  const fieldsDisabled = disabled || !!state.connectionString;

  return (
    <>
      <div className={styles.connectionStringSection}>
        <div className={styles.formField}>
          <label className={styles.label}>Connection String</label>
          <input
            className={`${styles.input} ${styles.inputWide}`}
            type="text"
            value={state.connectionString}
            onChange={(e) => onUpdate({ connectionString: e.target.value })}
            placeholder="clickhouse://user:pass@host:port/db"
            disabled={disabled}
          />
        </div>
      </div>

      <div className={styles.orDivider}>OR provide details below</div>

      <div className={styles.fieldsSection}>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.label}>Host</label>
            <input
              className={styles.input}
              type="text"
              value={state.host}
              onChange={(e) => onUpdate({ host: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Port</label>
            <input
              className={`${styles.input} ${styles.inputSmall}`}
              type="number"
              value={state.port}
              onChange={(e) => onUpdate({ port: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label className={styles.label}>User</label>
            <input
              className={styles.input}
              type="text"
              value={state.user}
              onChange={(e) => onUpdate({ user: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={state.password}
              onChange={(e) => onUpdate({ password: e.target.value })}
              disabled={fieldsDisabled}
            />
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.label}>Database</label>
          <input
            className={styles.input}
            type="text"
            value={state.database}
            onChange={(e) => onUpdate({ database: e.target.value })}
            disabled={fieldsDisabled}
          />
        </div>
      </div>
    </>
  );
}

