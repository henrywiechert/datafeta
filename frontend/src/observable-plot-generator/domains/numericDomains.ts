// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { getResultColumnName } from '../../utils/fieldUtils';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

function parseNumericCategory(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseNumericValue(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDateValue(value: any): number | null {
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    const ts = d.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

/**
 * Compute shared numeric domains (min..max with 0 baseline when applicable) for
 * both measures and continuous dimensions across provided candidates.
 * Keys are column names actually used in plotting:
 *  - For measures: result/alias column name
 *  - For dimensions: original columnName
 */
export function computeSharedNumericDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[]
): Record<string, [number, number] | [Date, Date]> {
  const labels: string[] = [];
  const fieldMap: Record<string, any> = {}; // label -> field

  const maybeAdd = (field: any) => {
    if (!field) return;
    let name;
    if (field.type === 'measure') {
      name = getResultColumnName({ ...field, aggregation: field.aggregation || 'sum' } as any);
    } else if (field.type === 'dimension' && field.flavour === 'continuous') {
      name = getResultColumnName(field);
    }
    if (name && !labels.includes(name)) {
      labels.push(name);
      fieldMap[name] = field;
    }
  };

  xCandidates?.forEach(maybeAdd);
  yCandidates?.forEach(maybeAdd);

  const domains: Record<string, [number, number] | [Date, Date]> = {};
  for (const label of labels) {
    const field = fieldMap[label];
    // Frontend fields use camelCase: dateTimeMode ('timeline' | 'distinct')
    const isTimeline = field?.dateTimeMode === 'timeline' || field?.date_mode === 'timeline';
    const minSummaryLabel = `${label}__min`;
    const maxSummaryLabel = `${label}__max`;
    if (isTimeline) {
      // IMPORTANT: avoid Math.min(...hugeArray) / Math.max(...hugeArray) which can stack overflow.
      let minTs = Infinity;
      let maxTs = -Infinity;
      for (const row of data) {
        const candidateValues = [row[label], row[minSummaryLabel], row[maxSummaryLabel]];
        for (const candidate of candidateValues) {
          const ts = parseDateValue(candidate);
          if (ts == null) continue;
          if (ts < minTs) minTs = ts;
          if (ts > maxTs) maxTs = ts;
        }
      }
      if (minTs === Infinity || maxTs === -Infinity) continue;
      const rangeMs = maxTs - minTs;
      const padMs = rangeMs * DOMAIN_PAD_RATIO;
      const minDate = new Date(minTs - padMs);
      const maxDate = new Date(maxTs + padMs);
      domains[label] = [minDate, maxDate];
    } else {
      // IMPORTANT: avoid Math.min(...hugeArray) / Math.max(...hugeArray) which can stack overflow.
      let min = Infinity;
      let max = -Infinity;
      for (const row of data) {
        const candidateValues = [row[label], row[minSummaryLabel], row[maxSummaryLabel]];
        for (const candidate of candidateValues) {
          const v = parseNumericValue(candidate);
          if (v == null) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min === Infinity || max === -Infinity) continue;
      const span = max - min;
      const pad = span * DOMAIN_PAD_RATIO;
      const lower = min - pad;
      const upper = max + pad;
      domains[label] = [lower, upper];
    }
  }

  return domains;
}

/**
 * Build shared categorical domains for discrete dimensions by their column names.
 * Ensures consistent band domains across plots/facets even when some categories are missing locally.
 */
export function computeSharedCategoricalDomains(data: any[], fields: any[]): Record<string, any[]> {
  const domains: Record<string, any[]> = {};
  const dims = fields.filter((f) => f && f.type === 'dimension' && f.flavour === 'discrete');
  for (const f of dims) {
    // Use getResultColumnName to handle DateTime parts correctly (e.g., fieldname_part_mode)
    const col = getResultColumnName(f);
    if (domains[col]) continue;
    
    // Use Map with a key function to handle Date objects correctly
    // (Date objects need to be compared by timestamp value, not by reference)
    const seen = new Map<string | number, any>();
    const values: any[] = [];
    for (const row of data) {
      const v = row[col];
      // For Date objects, use timestamp as key; for others, use the value itself
      const key = v instanceof Date ? v.getTime() : v;
      if (!seen.has(key)) {
        seen.set(key, v);
        values.push(v);
      }
    }
    try {
      // Smart sorting: dates by timestamp, numbers numerically, others as strings
      const allDates = values.every(v => v instanceof Date);
      const allNumeric = values.every(v => parseNumericCategory(v) !== null);
      if (allDates) {
        values.sort((a, b) => a.getTime() - b.getTime());
      } else if (allNumeric) {
        values.sort((a, b) => (parseNumericCategory(a) ?? 0) - (parseNumericCategory(b) ?? 0));
      } else {
        values.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
      }
    } catch {}
    domains[col] = values;
  }
  return domains;
}


