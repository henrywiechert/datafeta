import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';

export function filterRowsByFacet(
  rows: any[],
  rowField: Field | null,
  rowValue: any,
  colField: Field | null,
  colValue: any
): any[] {
  return rows.filter((row) => {
    if (rowField) {
      const col = getFieldColumnName(rowField);
      if (row[col] !== rowValue) return false;
    }
    if (colField) {
      const col = getFieldColumnName(colField);
      if (row[col] !== colValue) return false;
    }
    return true;
  });
}

export function filterRowsByFacets(
  rows: any[],
  rowFields: Field[],
  rowValues: any[],
  colFields: Field[],
  colValues: any[]
): any[] {
  return rows.filter((row) => {
    for (let i = 0; i < rowFields.length; i++) {
      const f = rowFields[i];
      const v = rowValues[i];
      const col = getFieldColumnName(f);
      if (v !== undefined && row[col] !== v) return false;
    }
    for (let j = 0; j < colFields.length; j++) {
      const f = colFields[j];
      const v = colValues[j];
      const col = getFieldColumnName(f);
      if (v !== undefined && row[col] !== v) return false;
    }
    return true;
  });
}

export function buildFacetCombos(fields: Field[], valuesLevels: any[][]): any[][] {
  if (fields.length === 0) return [];
  const result: any[][] = [];
  const helper = (level: number, acc: any[]) => {
    if (level === fields.length) {
      result.push(acc.slice());
      return;
    }
    const vals = valuesLevels[level] || [];
    for (let i = 0; i < vals.length; i++) {
      acc.push(vals[i]);
      helper(level + 1, acc);
      acc.pop();
    }
  };
  helper(0, []);
  return result;
}
