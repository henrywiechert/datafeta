import { getResultColumnName } from '../../utils/fieldUtils';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

/**
 * Compute shared numeric domains for all measures used across a grid.
 * Always start at 0 and pad the max by +5%.
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
    const max = Math.max(0, ...values);
    const upper = max === 0 ? 1 : max * (1 + DOMAIN_PAD_RATIO);
    domains[measureName] = [0, upper];
  });

  return domains;
}


