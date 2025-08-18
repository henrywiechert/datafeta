import { getResultColumnName } from '../../utils/fieldUtils';

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
      const name = field.columnName;
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
    const lower = Math.min(0, min);
    const upper = max <= 0 ? 0 : max; // do not add headroom here; leave to mark creators if needed
    domains[label] = [lower, upper];
  }

  return domains;
}


