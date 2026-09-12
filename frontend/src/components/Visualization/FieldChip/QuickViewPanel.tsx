// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Quick View — statistical profile of a field, opened by hovering the menu item.
 *
 * The profile describes the raw column and ignores active filters, so what is
 * shown stays stable while the user edits filters.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Field } from '../../../types';
import menuStyles from '../ContextMenu.module.css';
import styles from './QuickViewPanel.module.css';
import { getProfileKind, useFieldProfile } from '../../../hooks/useFieldProfile';

interface QuickViewPanelProps {
  field: Field;
}

const PANEL_WIDTH_PX = 240;

const formatInteger = (value: number): string => value.toLocaleString();

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  if (Number.isInteger(value)) return formatInteger(value);
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 0.001 || magnitude >= 1e9)) {
    return value.toExponential(2);
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const formatPercent = (part: number, total: number): string => {
  if (total <= 0) return '0%';
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '(null)';
  if (value === '') return '(empty)';
  return String(value);
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className={styles.row}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value}</span>
  </div>
);

const QuickViewPanel: React.FC<QuickViewPanelProps> = ({ field }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openToLeft, setOpenToLeft] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { profile, loading, error, start, cancel, loadExact } = useFieldProfile(field);

  const handleMouseEnter = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setOpenToLeft(rect.right + PANEL_WIDTH_PX > window.innerWidth - 20);
    }
    setIsOpen(true);
    start();
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
    cancel();
  };

  useEffect(() => cancel, [cancel]);

  const kind = getProfileKind(field);

  const renderBody = () => {
    if (error) return <div className={styles.error}>{error}</div>;
    if (!profile) return <div className={styles.muted}>{loading ? 'Loading…' : 'Hover to load'}</div>;

    const { row_count: rows, null_count: nulls, distinct_count: distinct } = profile;
    const distinctText = distinct === null || distinct === undefined
      ? '—'
      : `${profile.approximate ? '~' : ''}${formatInteger(distinct)}`;

    return (
      <>
        <Row label="Rows" value={formatInteger(rows)} />
        <Row label="Nulls" value={`${formatInteger(nulls)} (${formatPercent(nulls, rows)})`} />
        <Row
          label="Distinct"
          value={
            <span title={profile.approximate ? 'Approximate (HyperLogLog)' : 'Exact'}>
              {distinctText}
            </span>
          }
        />

        {profile.numeric && (
          <>
            <div className={styles.sectionTitle}>Distribution</div>
            <Row label="Min / Max" value={`${formatNumber(profile.numeric.min)} / ${formatNumber(profile.numeric.max)}`} />
            <Row label="Mean" value={formatNumber(profile.numeric.mean)} />
            <Row label="Std dev" value={formatNumber(profile.numeric.stddev)} />
            <Row label="p25 / med / p75" value={`${formatNumber(profile.numeric.q1)} / ${formatNumber(profile.numeric.median)} / ${formatNumber(profile.numeric.q3)}`} />
            {profile.numeric.non_finite_count > 0 && (
              <Row label="NaN / Inf" value={formatInteger(profile.numeric.non_finite_count)} />
            )}
          </>
        )}

        {profile.datetime && (
          <>
            <div className={styles.sectionTitle}>Range</div>
            <Row label="Earliest" value={profile.datetime.min ?? '—'} />
            <Row label="Latest" value={profile.datetime.max ?? '—'} />
          </>
        )}

        {profile.string && kind !== 'datetime' && (
          <>
            <Row label="Length" value={`${formatNumber(profile.string.min_length)} – ${formatNumber(profile.string.max_length)}`} />
            {profile.string.empty_count > 0 && (
              <Row label="Empty" value={formatInteger(profile.string.empty_count)} />
            )}
          </>
        )}

        {profile.string && profile.string.top_values.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Most frequent</div>
            {profile.string.top_values.map((tv, i) => (
              <div key={i} className={styles.topValue}>
                <span className={styles.topValueLabel} title={formatValue(tv.value)}>
                  {formatValue(tv.value)}
                </span>
                <span className={styles.value}>
                  {formatInteger(tv.count)} ({formatPercent(tv.count, rows)})
                </span>
              </div>
            ))}
          </>
        )}

        {profile.approximate && (
          <div className={styles.exactLink} onClick={loadExact}>
            {loading ? 'Counting…' : 'Count exactly'}
          </div>
        )}
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      className={menuStyles.subMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`${menuStyles.menuItem} ${menuStyles.subMenuItem}`}>
        Quick View →
      </div>
      {isOpen && (
        <div className={`${styles.panel} ${openToLeft ? styles.panelLeft : ''}`}>
          <div className={styles.header}>{field.displayAlias || field.columnName}</div>
          <div className={styles.subHeader}>{field.dataType} · raw column</div>
          {renderBody()}
        </div>
      )}
    </div>
  );
};

export default QuickViewPanel;
