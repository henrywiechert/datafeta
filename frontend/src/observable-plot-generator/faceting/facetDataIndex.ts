// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { getFieldColumnName } from '../helpers/fields';
import { filterRowsByFacets } from './facetUtils';

const EMPTY_KEY = '[]';

/**
 * Indexes rows by facet values so faceted rendering does not repeatedly scan
 * the full result set for every row/column/cell combination.
 */
export class FacetDataIndex {
  private readonly rowColumnNames: string[];
  private readonly colColumnNames: string[];
  private readonly rowMap = new Map<string, any[]>();
  private readonly colMap = new Map<string, any[]>();
  private readonly cellMap = new Map<string, any[]>();
  private readonly objectIds = new WeakMap<object, number>();
  private nextObjectId = 1;

  constructor(
    private readonly rows: any[],
    private readonly rowFields: Field[],
    private readonly colFields: Field[]
  ) {
    this.rowColumnNames = rowFields.map((field) => getFieldColumnName(field));
    this.colColumnNames = colFields.map((field) => getFieldColumnName(field));
    this.build();
  }

  getCellRows(rowValues: any[], colValues: any[]): any[] {
    if (hasWildcard(rowValues) || hasWildcard(colValues)) {
      return filterRowsByFacets(this.rows, this.rowFields, rowValues, this.colFields, colValues);
    }

    return this.cellMap.get(this.cellKeyFromValues(rowValues, colValues)) || [];
  }

  getRowRows(rowValues: any[]): any[] {
    if (hasWildcard(rowValues)) {
      return filterRowsByFacets(this.rows, this.rowFields, rowValues, [], []);
    }

    return this.rowMap.get(this.valuesKey(rowValues)) || [];
  }

  getColumnRows(colValues: any[]): any[] {
    if (hasWildcard(colValues)) {
      return filterRowsByFacets(this.rows, [], [], this.colFields, colValues);
    }

    return this.colMap.get(this.valuesKey(colValues)) || [];
  }

  private build(): void {
    for (const row of this.rows) {
      const rowKey = this.rowKeyFromRow(row);
      const colKey = this.colKeyFromRow(row);
      pushMapValue(this.rowMap, rowKey, row);
      pushMapValue(this.colMap, colKey, row);
      pushMapValue(this.cellMap, this.cellKey(rowKey, colKey), row);
    }
  }

  private rowKeyFromRow(row: any): string {
    return this.valuesKey(this.rowColumnNames.map((columnName) => row[columnName]));
  }

  private colKeyFromRow(row: any): string {
    return this.valuesKey(this.colColumnNames.map((columnName) => row[columnName]));
  }

  private cellKeyFromValues(rowValues: any[], colValues: any[]): string {
    return this.cellKey(this.valuesKey(rowValues), this.valuesKey(colValues));
  }

  private cellKey(rowKey: string, colKey: string): string {
    return JSON.stringify([rowKey, colKey]);
  }

  private valuesKey(values: any[]): string {
    if (values.length === 0) return EMPTY_KEY;
    return JSON.stringify(values.map((value) => this.valueKey(value)));
  }

  private valueKey(value: any): [string, any] {
    if (value instanceof Date) return ['date', value.getTime()];
    if (value === null) return ['null', null];
    if (typeof value === 'object' || typeof value === 'function') {
      return ['object', this.getObjectId(value)];
    }
    return [typeof value, typeof value === 'bigint' ? value.toString() : value];
  }

  private getObjectId(value: object): number {
    const existing = this.objectIds.get(value);
    if (existing !== undefined) return existing;
    const next = this.nextObjectId++;
    this.objectIds.set(value, next);
    return next;
  }
}

function pushMapValue(map: Map<string, any[]>, key: string, row: any): void {
  const rows = map.get(key);
  if (rows) {
    rows.push(row);
  } else {
    map.set(key, [row]);
  }
}

function hasWildcard(values: any[]): boolean {
  return values.some((value) => value === undefined);
}
