// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Small inline charts for the Quick View panel.
 *
 * Plain SVG rather than Observable Plot: these are ~240x50 glyphs inside a
 * hover popover, where a full plot runtime would cost more than it renders.
 */

import React from 'react';
import { DatetimeBucket, HistogramBin, NumericProfile, TopValue } from '../../../types';
import styles from './QuickViewPanel.module.css';
import {
  formatBucketLabel,
  formatCompact,
  formatInteger,
  formatNumber,
  formatPercent,
  formatValue,
} from './quickViewFormat';

const CHART_WIDTH = 236;
const BARS_HEIGHT = 44;
const STRIP_HEIGHT = 12;

interface ColumnChartProps {
  counts: number[];
  titles: string[];
  leftLabel: string;
  rightLabel: string;
}

const ColumnChart: React.FC<ColumnChartProps> = ({ counts, titles, leftLabel, rightLabel }) => {
  const peak = Math.max(...counts, 1);
  const slot = CHART_WIDTH / counts.length;
  const barWidth = Math.max(1, slot - 1);

  return (
    <>
      <svg
        className={styles.chart}
        width={CHART_WIDTH}
        height={BARS_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${BARS_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
      >
        {counts.map((count, i) => {
          // Non-empty buckets keep a 1px stub so rare values stay visible.
          const height = count === 0 ? 0 : Math.max(1, (count / peak) * BARS_HEIGHT);
          return (
            <rect
              key={i}
              x={i * slot}
              y={BARS_HEIGHT - height}
              width={barWidth}
              height={height}
              className={styles.bar}
            >
              <title>{titles[i]}</title>
            </rect>
          );
        })}
      </svg>
      <div className={styles.axis}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </>
  );
};

/** Five-number summary drawn on the same x-scale as the histogram above it. */
const QuartileStrip: React.FC<{ numeric: NumericProfile }> = ({ numeric }) => {
  const { min, max, q1, median, q3 } = numeric;
  if (min === null || min === undefined || max === null || max === undefined || max === min) {
    return null;
  }
  if (q1 === null || q1 === undefined || q3 === null || q3 === undefined) return null;

  const scale = (v: number) => ((v - min) / (max - min)) * CHART_WIDTH;
  const boxLeft = scale(q1);
  const boxWidth = Math.max(1, scale(q3) - boxLeft);
  const mid = STRIP_HEIGHT / 2;

  return (
    <svg
      className={styles.strip}
      width={CHART_WIDTH}
      height={STRIP_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${STRIP_HEIGHT}`}
      role="img"
    >
      <title>
        {`min ${formatNumber(min)} · p25 ${formatNumber(q1)} · median ${formatNumber(median)}`
          + ` · p75 ${formatNumber(q3)} · max ${formatNumber(max)}`}
      </title>
      <line x1={0} y1={mid} x2={CHART_WIDTH} y2={mid} className={styles.whisker} />
      <rect x={boxLeft} y={2} width={boxWidth} height={STRIP_HEIGHT - 4} className={styles.box} />
      {median !== null && median !== undefined && (
        <line
          x1={scale(median)}
          y1={1}
          x2={scale(median)}
          y2={STRIP_HEIGHT - 1}
          className={styles.median}
        />
      )}
    </svg>
  );
};

export const NumericDistribution: React.FC<{ numeric: NumericProfile }> = ({ numeric }) => {
  const bins: HistogramBin[] = numeric.histogram;
  if (bins.length === 0) return null;
  return (
    <>
      <ColumnChart
        counts={bins.map(b => b.count)}
        titles={bins.map(
          b => `${formatNumber(b.lower)} – ${formatNumber(b.upper)}: ${formatInteger(b.count)}`,
        )}
        leftLabel={formatCompact(numeric.min)}
        rightLabel={formatCompact(numeric.max)}
      />
      <QuartileStrip numeric={numeric} />
    </>
  );
};

export const TimeDistribution: React.FC<{
  buckets: DatetimeBucket[];
  bucket?: string | null;
}> = ({ buckets, bucket }) => {
  if (buckets.length === 0) return null;

  return (
    <ColumnChart
      counts={buckets.map(b => b.count)}
      titles={buckets.map(
        b => `${formatBucketLabel(b.start, bucket)}: ${formatInteger(b.count)}`,
      )}
      leftLabel={formatBucketLabel(buckets[0].start, bucket)}
      rightLabel={formatBucketLabel(buckets[buckets.length - 1].start, bucket)}
    />
  );
};

export const TopValueBars: React.FC<{ values: TopValue[]; total: number }> = ({ values, total }) => {
  // Scaled to the most frequent value, not to the row count: otherwise a long
  // tail renders as a row of invisible slivers.
  const peak = Math.max(...values.map(v => v.count), 1);

  return (
    <div>
      {values.map((tv, i) => (
        <div
          key={i}
          className={styles.topValueRow}
          title={`${formatValue(tv.value)}: ${formatInteger(tv.count)} rows (${formatPercent(tv.count, total)})`}
        >
          <div className={styles.topValueFill} style={{ width: `${(tv.count / peak) * 100}%` }} />
          <span className={styles.topValueLabel}>{formatValue(tv.value)}</span>
          <span className={styles.topValueCount}>{formatPercent(tv.count, total)}</span>
        </div>
      ))}
    </div>
  );
};

/** Share of rows that carry a usable value, versus empty, null or non-finite. */
export const CompletenessBar: React.FC<{
  total: number;
  nulls: number;
  empty?: number;
  nonFinite?: number;
}> = ({ total, nulls, empty = 0, nonFinite = 0 }) => {
  if (total <= 0) return null;
  const bad = nulls + empty + nonFinite;
  const valid = Math.max(0, total - bad);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div
      className={styles.completeness}
      title={
        `${formatInteger(valid)} valid · ${formatInteger(nulls)} null`
        + (empty ? ` · ${formatInteger(empty)} empty` : '')
        + (nonFinite ? ` · ${formatInteger(nonFinite)} NaN/Inf` : '')
      }
    >
      <div className={styles.segValid} style={{ width: pct(valid) }} />
      <div className={styles.segEmpty} style={{ width: pct(empty) }} />
      <div className={styles.segNonFinite} style={{ width: pct(nonFinite) }} />
      <div className={styles.segNull} style={{ width: pct(nulls) }} />
    </div>
  );
};
