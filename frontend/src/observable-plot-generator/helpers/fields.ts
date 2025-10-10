import { getResultColumnName } from '../../utils/fieldUtils';

export function getFieldColumnName(field: any): string {
  // Use getResultColumnName for both measures and dimensions
  // This handles measures with aggregations and dimensions with datetime parts
  if (field.type === 'measure') {
    const agg = field.aggregation || 'sum';
    return getResultColumnName({ ...field, aggregation: agg } as any);
  }
  // For dimensions, getResultColumnName handles datetime parts correctly
  return getResultColumnName(field as any);
}


