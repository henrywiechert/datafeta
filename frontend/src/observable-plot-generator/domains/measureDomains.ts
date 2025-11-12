import { getResultColumnName } from '../../utils/fieldUtils';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

/**
 * Compute shared numeric domains for all measures used across a grid.
 * Preserves negative ranges and adds DOMAIN_PAD_RATIO headroom to both sides.
 * 
 * For stacked charts with color fields, computes the domain based on stacked totals,
 * separating positive and negative stacks so mixed-sign data keeps the correct extent.
 * When faceting is present, totals are computed per facet to avoid inflating the
 * domain with data from other facets.
 */
export function computeSharedMeasureDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[],
  colorField?: any,
  categoryField?: any,
  facetFields?: any[]
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
    
    if (colorField && categoryField) {
      const categoryColumnName = getResultColumnName(categoryField);
      const facetColumnNames = facetFields?.map((f: any) => getResultColumnName(f)) ?? [];
      const stackTotals = new Map<string, { pos: number; neg: number }>();

      for (const row of data) {
        const category = row[categoryColumnName];
        const value = row[measureName];
        if (typeof value !== 'number' || Number.isNaN(value)) continue;

        const facetKey = facetColumnNames.length > 0
          ? facetColumnNames.map((col: string) => row[col]).join('|')
          : '__global__';
        const key = `${facetKey}::${category}`;
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
    } else if (colorField && !categoryField) {
      let posTotal = 0;
      let negTotal = 0;
      for (const row of data) {
        const value = row[measureName];
        if (typeof value !== 'number' || Number.isNaN(value)) continue;
        if (value >= 0) {
          posTotal += value;
        } else {
          negTotal += value;
        }
      }
      if (posTotal !== 0) updateRange(posTotal);
      if (negTotal !== 0) updateRange(negTotal);
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


