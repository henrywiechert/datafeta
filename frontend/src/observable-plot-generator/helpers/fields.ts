import { getResultColumnName } from '../../utils/fieldUtils';

export function getFieldColumnName(field: any): string {
  if (field.type === 'measure') {
    const agg = field.aggregation || 'sum';
    return getResultColumnName({ ...field, aggregation: agg } as any);
  }
  return field.columnName;
}


