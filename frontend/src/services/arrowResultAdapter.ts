import { Table as ArrowTable } from 'apache-arrow';

export function normalizeArrowValue(value: any): any {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  return value;
}

export function arrowTableToRows(table: ArrowTable): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const columns = table.schema.fields.map((f) => f.name);

  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, any> = {};
    for (const col of columns) {
      row[col] = normalizeArrowValue(table.getChild(col)?.get(i));
    }
    rows.push(row);
  }

  return rows;
}


