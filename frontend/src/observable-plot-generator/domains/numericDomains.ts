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
    if (field.date_mode === 'timeline') {
      const dateValues = data
        .map((row) => new Date(row[label]))
        .filter((d) => !isNaN(d.getTime()));
      if (dateValues.length === 0) continue;
      const timestamps = dateValues.map(d => d.getTime());
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      const rangeMs = maxTs - minTs;
      const padMs = rangeMs * DOMAIN_PAD_RATIO;
      const minDate = new Date(minTs - padMs);
      const maxDate = new Date(maxTs + padMs);
      domains[label] = [minDate, maxDate];
    } else {
      const values = data
        .map((row) => row[label])
        .filter((v) => typeof v === 'number' && !Number.isNaN(v));
      if (values.length === 0) continue;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const lower = min - Math.abs(min) * DOMAIN_PAD_RATIO;
      const upper = max <= 0 ? 0 : max * (1 + DOMAIN_PAD_RATIO);
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


