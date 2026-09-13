// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Quick View — statistical profile of a field, opened by hovering the menu item.
 *
 * The profile describes the raw column and ignores active filters, so what is
 * shown stays stable while the user edits filters.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Field, FieldProfile } from '../../../types';
import menuStyles from '../ContextMenu.module.css';
import styles from './QuickViewPanel.module.css';
import { getProfileKind, useFieldProfile } from '../../../hooks/useFieldProfile';
import { useFlyoutPosition } from '../useFlyoutPosition';
import {
  CompletenessBar,
  NumericDistribution,
  TimeDistribution,
  TopValueBars,
} from './QuickViewCharts';
import { formatInteger, formatNumber, formatPercent } from './quickViewFormat';

interface QuickViewPanelProps {
  field: Field;
}

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className={styles.row}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value}</span>
  </div>
);

const LegendItem: React.FC<{ swatch: string; text: string }> = ({ swatch, text }) => (
  <span className={styles.legendItem}>
    <span className={`${styles.swatch} ${swatch}`} />
    {text}
  </span>
);

const Completeness: React.FC<{ profile: FieldProfile }> = ({ profile }) => {
  const rows = profile.row_count;
  const nulls = profile.null_count;
  const empty = profile.string?.empty_count ?? 0;
  const nonFinite = profile.numeric?.non_finite_count ?? 0;
  const valid = Math.max(0, rows - nulls - empty - nonFinite);

  return (
    <>
      <CompletenessBar total={rows} nulls={nulls} empty={empty} nonFinite={nonFinite} />
      <div className={styles.legend}>
        <LegendItem swatch={styles.segValid} text={`${formatPercent(valid, rows)} valid`} />
        {nulls > 0 && (
          <LegendItem swatch={styles.segNull} text={`${formatPercent(nulls, rows)} null`} />
        )}
        {empty > 0 && (
          <LegendItem swatch={styles.segEmpty} text={`${formatPercent(empty, rows)} empty`} />
        )}
        {nonFinite > 0 && (
          <LegendItem
            swatch={styles.segNonFinite}
            text={`${formatInteger(nonFinite)} NaN/Inf`}
          />
        )}
      </div>
    </>
  );
};

const QuickViewPanel: React.FC<QuickViewPanelProps> = ({ field }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { profile, loading, error, start, cancel, loadExact } = useFieldProfile(field);
  const { openToLeft, openUpward, maxHeight } = useFlyoutPosition(
    containerRef,
    panelRef,
    isOpen,
  );

  const handleMouseEnter = () => {
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
    if (!profile) {
      return loading ? (
        <>
          <div className={styles.skeleton} style={{ width: '70%' }} />
          <div className={styles.skeleton} style={{ width: '100%', height: 40 }} />
          <div className={styles.skeleton} style={{ width: '50%' }} />
        </>
      ) : (
        <div className={styles.muted}>Hover to load</div>
      );
    }

    const { row_count: rows, distinct_count: distinct, numeric } = profile;
    const distinctText = distinct === null || distinct === undefined
      ? '—'
      : `${profile.approximate ? '~' : ''}${formatInteger(distinct)}`;

    return (
      <>
        <Row label="Rows" value={formatInteger(rows)} />
        <Row
          label="Distinct"
          value={
            <span title={profile.approximate ? 'Approximate (HyperLogLog)' : 'Exact'}>
              {distinctText}
            </span>
          }
        />
        <Completeness profile={profile} />

        {numeric && numeric.value_counts.length > 0 && (
          <>
            <div className={styles.sectionTitle}>
              {`Values (${numeric.value_counts.length})`}
            </div>
            <TopValueBars values={numeric.value_counts} total={rows} />
          </>
        )}

        {numeric && numeric.histogram.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Distribution</div>
            <NumericDistribution numeric={numeric} />
          </>
        )}

        {/* A constant column makes every summary statistic restate the value. */}
        {numeric && numeric.value_counts.length !== 1 && (
          <>
            <Row
              label="p25 · median · p75"
              value={`${formatNumber(numeric.q1)} · ${formatNumber(numeric.median)} · ${formatNumber(numeric.q3)}`}
            />
            <Row
              label="mean ± sd"
              value={`${formatNumber(numeric.mean)} ± ${formatNumber(numeric.stddev)}`}
            />
          </>
        )}

        {profile.datetime && (
          <>
            <div className={styles.sectionTitle}>
              Over time{profile.datetime.bucket ? ` (by ${profile.datetime.bucket})` : ''}
            </div>
            <TimeDistribution
              buckets={profile.datetime.buckets}
              bucket={profile.datetime.bucket}
            />
            <Row label="Earliest" value={profile.datetime.min ?? '—'} />
            <Row label="Latest" value={profile.datetime.max ?? '—'} />
          </>
        )}

        {profile.string && profile.string.top_values.length > 0 && (
          <>
            <div className={styles.sectionTitle}>Most frequent</div>
            <TopValueBars values={profile.string.top_values} total={rows} />
          </>
        )}

        {profile.string && kind === 'string' && (
          <Row
            label="Length"
            value={`${formatNumber(profile.string.min_length)} – ${formatNumber(profile.string.max_length)}`}
          />
        )}

        {profile.approximate && (
          <div className={styles.exactLink} onClick={loadExact}>
            {loading ? 'Counting…' : 'Count distinct exactly'}
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
        <div
          ref={panelRef}
          className={[
            styles.panel,
            openToLeft ? styles.panelLeft : '',
            openUpward ? styles.panelUp : '',
          ].filter(Boolean).join(' ')}
          style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
        >
          <div className={styles.header}>{field.displayAlias || field.columnName}</div>
          <div className={styles.subHeader}>{field.dataType} · raw column</div>
          {renderBody()}
        </div>
      )}
    </div>
  );
};

export default QuickViewPanel;
