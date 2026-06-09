// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, Sheet, VirtualColumnDefinition } from '../types';

export interface SchemaCheckResult {
  totalReferencedColumns: number;
  missingColumns: string[];
  missingJoinedTables: string[];
  sheetCount: number;
  allClear: boolean;
}

type UnionTableRef = { database: string; table_name: string };

function addColumnName(set: Set<string>, field: Field | null | undefined): void {
  if (field?.columnName) {
    set.add(field.columnName);
  }
}

function addFields(set: Set<string>, fields: Field[] | undefined): void {
  fields?.forEach((field) => addColumnName(set, field));
}

/** True when union tables reference a database other than the primary. */
export function hasCrossDatabaseUnion(
  primaryDatabase: string,
  unionTables: UnionTableRef[],
): boolean {
  if (!primaryDatabase || unionTables.length === 0) return false;
  return unionTables.some(
    (ut) => ut.database && ut.database !== primaryDatabase,
  );
}

/** Rewrite union table database refs when swapping the primary database namespace. */
export function rewriteUnionTablesForDatabase(
  unionTables: UnionTableRef[],
  oldDatabase: string,
  newDatabase: string,
): UnionTableRef[] {
  return unionTables.map((ut) => ({
    ...ut,
    database:
      !ut.database || ut.database === oldDatabase ? newDatabase : ut.database,
  }));
}

/** Collect column names referenced across all sheets and session filters. */
export function collectReferencedColumnNames(
  sheets: Sheet[],
  sessionFilterFields: Field[] = [],
  virtualColumns: VirtualColumnDefinition[] = [],
): Set<string> {
  const columns = new Set<string>();

  virtualColumns.forEach((vc) => {
    if (vc.name) columns.add(vc.name);
  });

  sessionFilterFields.forEach((field) => addColumnName(columns, field));

  sheets.forEach((sheet) => {
    const vs = sheet.visualizationState;
    addFields(columns, vs.xAxisFields);
    addFields(columns, vs.yAxisFields);
    addFields(columns, vs.filterFields);
    addFields(columns, vs.labelFields);
    addFields(columns, vs.tooltipFields);
    addFields(columns, vs.measureGroupFields);
    addColumnName(columns, vs.colorField);
    addColumnName(columns, vs.sizeField);
    addColumnName(columns, vs.shapeField);
    addColumnName(columns, vs.facetBackgroundField);
  });

  return columns;
}

export function validateSheetSchema(
  sheets: Sheet[],
  availableFields: Field[],
  joinedTables: string[],
  tableNamesInDatabase: string[],
  sessionFilterFields: Field[] = [],
  virtualColumns: VirtualColumnDefinition[] = [],
): SchemaCheckResult {
  const referenced = collectReferencedColumnNames(
    sheets,
    sessionFilterFields,
    virtualColumns,
  );

  const availableColumnNames = new Set([
    ...availableFields.map((f) => f.columnName),
    ...virtualColumns.map((vc) => vc.name).filter(Boolean),
  ]);

  const missingColumns = Array.from(referenced)
    .filter((name) => !availableColumnNames.has(name))
    .sort();

  const tableNameSet = new Set(tableNamesInDatabase);
  const missingJoinedTables = joinedTables
    .filter((name) => !tableNameSet.has(name))
    .sort();

  return {
    totalReferencedColumns: referenced.size,
    missingColumns,
    missingJoinedTables,
    sheetCount: sheets.length,
    allClear: missingColumns.length === 0 && missingJoinedTables.length === 0,
  };
}
