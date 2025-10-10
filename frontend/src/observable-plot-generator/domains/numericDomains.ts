import { getResultColumnName } from '../../utils/fieldUtils';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

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
): Record<string, [number, number]> {
  const labels: string[] = [];

  const maybeAdd = (field: any) => {
    if (!field) return;
    if (field.type === 'measure') {
      const name = getResultColumnName({ ...field, aggregation: field.aggregation || 'sum' } as any);
      if (!labels.includes(name)) labels.push(name);
    } else if (field.type === 'dimension' && field.flavour === 'continuous') {
      // Use getResultColumnName to handle DateTime parts correctly
      const name = getResultColumnName(field);
      if (!labels.includes(name)) labels.push(name);
    }
  };

  xCandidates?.forEach(maybeAdd);
  yCandidates?.forEach(maybeAdd);

  const domains: Record<string, [number, number]> = {};
  for (const label of labels) {
    const values = data
      .map((row) => row[label])
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lower = min - Math.abs(min) * DOMAIN_PAD_RATIO;
    // Add headroom so points don't touch the boundary.
    const upper = max <= 0 ? 0 : max * (1 + DOMAIN_PAD_RATIO);
    domains[label] = [lower, upper];
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
    const seen = new Set<any>();
    const values: any[] = [];
    for (const row of data) {
      const v = row[col];
      if (!seen.has(v)) {
        seen.add(v);
        values.push(v);
      }
    }
    try {
      // Smart sorting: if all values are numeric, sort numerically; otherwise sort as strings
      const allNumeric = values.every(v => typeof v === 'number' && !Number.isNaN(v));
      if (allNumeric) {
        values.sort((a, b) => a - b);
      } else {
        values.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
      }
    } catch {}
    domains[col] = values;
  }
  return domains;
}


