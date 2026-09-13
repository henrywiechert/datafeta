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
import {
  formatBucketLabel,
  formatDuration,
  formatInteger,
  formatNumber,
  formatPercent,
  formatRelative,
} from './quickViewFormat';

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

const DatetimeSection: React.FC<{ profile: FieldProfile }> = ({ profile }) => {
  const dt = profile.datetime;
  if (!dt) return null;

  const nonNull = profile.row_count - profile.null_count;
  const distinct = profile.distinct_count ?? 0;
  // Cadence of the series rather than of the rows: duplicates of the same
  // timestamp say nothing about how often the column was sampled.
  const averageInterval = dt.span_seconds && distinct > 1
    ? dt.span_seconds / (distinct - 1)
    : null;
  const rowsPerValue = distinct > 0 ? nonNull / distinct : null;
  const showCoverage = !dt.truncated && dt.expected_buckets > 0;
  const largestGap = dt.gaps[0];

  return (
    <>
      <div className={styles.sectionTitle}>Characteristics</div>
      <Row
        label="Range"
        value={
          <span title={`${dt.min ?? '—'} → ${dt.max ?? '—'}`}>
            {`${(dt.min ?? '').slice(0, 10)} → ${(dt.max ?? '').slice(0, 10)}`}
          </span>
        }
      />
      <Row label="Span" value={formatDuration(dt.span_seconds)} />
      <Row label="Resolution" value={dt.resolution ?? 'sub-second'} />
      {averageInterval !== null && (
        <Row label="Avg interval" value={`≈ ${formatDuration(averageInterval)}`} />
      )}
      {rowsPerValue !== null && rowsPerValue > 1.05 && (
        <Row label="Rows per value" value={formatNumber(rowsPerValue)} />
      )}
      <Row label="Latest" value={formatRelative(dt.max)} />

      {dt.buckets.length > 0 && (
        <>
          <div className={styles.sectionTitle}>
            Over time{dt.bucket ? ` (by ${dt.bucket})` : ''}
          </div>
          <TimeDistribution buckets={dt.buckets} bucket={dt.bucket} />
          {showCoverage && (
            <Row
              label="Coverage"
              value={`${formatInteger(dt.populated_buckets)} of ${formatInteger(dt.expected_buckets)} ${dt.bucket}s`
                + ` (${formatPercent(dt.populated_buckets, dt.expected_buckets)})`}
            />
          )}
          {largestGap && (
            <Row
              label={dt.gaps.length > 1 ? `Gaps (${dt.gaps.length})` : 'Gap'}
              value={`${largestGap.length} ${dt.bucket}${largestGap.length === 1 ? '' : 's'}`
                + ` @ ${formatBucketLabel(largestGap.start, dt.bucket)}`}
            />
          )}
        </>
      )}
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
          <DatetimeSection profile={profile} />
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

        {/* The blank line is deliberate: dropping the row once the count is exact
            would shrink the panel out from under the pointer, and the resulting
            mouseleave closes Quick View. */}
        {profile.approximate ? (
          <div className={styles.exactLink} onClick={loading ? undefined : loadExact}>
            {loading ? 'Counting…' : 'Count distinct exactly'}
          </div>
        ) : (
          <div className={styles.exactSpacer} aria-hidden>{'\u00a0'}</div>
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
