// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { getResultColumnName } from '../../utils/fieldUtils';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

/**
 * Compute shared numeric domains for all measures used across a grid.
 * Preserves negative ranges and adds DOMAIN_PAD_RATIO headroom to both sides.
 * 
 * For stacked charts, computes the domain based on stacked totals (per category when
 * given), separating positive and negative stacks so mixed-sign data keeps the correct
 * extent. Charts stack by default when there is a color field; bar marks also stack
 * rows that share a category without one (e.g. a tooltip dimension), so they pass
 * `stacked` explicitly.
 * When faceting is present, totals are computed per facet to avoid inflating the
 * domain with data from other facets.
 */
export function computeSharedMeasureDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[],
  colorField?: any,
  categoryField?: any,
  facetFields?: any[],
  stacked: boolean = !!colorField
): Record<string, [number, number]> {
  const measures: string[] = [];

  const addMeasure = (field: any) => {
    if (field?.type === 'measure') {
      const name = getResultColumnName({ ...field, aggregation: field.aggregation || 'sum' } as any);
      if (!measures.includes(name)) measures.push(name);
    }
  };

  xCandidates.forEach(addMeasure);
  yCandidates.forEach(addMeasure);

  const domains: Record<string, [number, number]> = {};
  measures.forEach((measureName) => {
    let minVal = Infinity;
    let maxVal = -Infinity;

    const updateRange = (value: number) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      if (value < minVal) minVal = value;
      if (value > maxVal) maxVal = value;
    };
    
    if (stacked) {
      const categoryColumnName = categoryField ? getResultColumnName(categoryField) : undefined;
      const facetColumnNames = facetFields?.map((f: any) => getResultColumnName(f)) ?? [];
      const stackTotals = new Map<string, { pos: number; neg: number }>();

      for (const row of data) {
        const value = row[measureName];
        if (typeof value !== 'number' || Number.isNaN(value)) continue;

        const facetKey = facetColumnNames.length > 0
          ? facetColumnNames.map((col: string) => row[col]).join('|')
          : '__global__';
        const key = categoryColumnName ? `${facetKey}::${row[categoryColumnName]}` : facetKey;
        const entry = stackTotals.get(key) ?? { pos: 0, neg: 0 };
        if (value >= 0) {
          entry.pos += value;
        } else {
          entry.neg += value;
        }
        stackTotals.set(key, entry);
      }

      stackTotals.forEach(({ pos, neg }) => {
        if (pos !== 0) updateRange(pos);
        if (neg !== 0) updateRange(neg);
      });
    } else {
      for (const row of data) {
        updateRange(row[measureName]);
      }
    }

    if (minVal === Infinity || maxVal === -Infinity) {
      domains[measureName] = [0, 1];
      return;
    }

    if (minVal === 0 && maxVal === 0) {
      domains[measureName] = [0, 1];
      return;
    }

    if (maxVal <= 0) {
      const padBase = Math.max(Math.abs(minVal), Math.abs(maxVal));
      const pad = padBase === 0 ? 1 : padBase * DOMAIN_PAD_RATIO;
      domains[measureName] = [minVal - pad, 0];
      return;
    }

    if (minVal >= 0) {
      const upper = maxVal * (1 + DOMAIN_PAD_RATIO);
      domains[measureName] = [0, upper === 0 ? 1 : upper];
      return;
    }

    const span = maxVal - minVal;
    const pad = span * DOMAIN_PAD_RATIO;
    domains[measureName] = [minVal - pad, maxVal + pad];
  });

  return domains;
}


