import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Compute shared numeric domains for all measures used across a grid.
 * Includes 0 and adds 10% headroom at the top, similar to bar charts.
 */
export function computeSharedMeasureDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[]
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
    const values = data
      .map((row) => row[measureName])
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const lower = Math.min(0, min);
    const upper = max <= 0 ? 0 : max * 1.1; // clamp to 0 if non-positive
    domains[measureName] = [lower, upper];
  });

  return domains;
}


