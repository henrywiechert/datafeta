// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, Sheet, VirtualColumnDefinition } from '../types';

export interface SchemaCheckResult {
  totalReferencedColumns: number;
  missingColumns: string[];
  missingJoinedTables: string[];
  sheetCount: number;
  allClear: boolean;
}

export type UnionTableRef = { database: string; table_name: string };

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

/**
 * Upper bound on union members, mirroring the backend's
 * `TableMergeService.MAX_UNION_TABLES` (backend/services/table_merge_service.py).
 * Keep the two in sync — the backend rejects the query past this point.
 */
export const MAX_UNION_TABLES = 100;

export interface DatabaseMirrorPlan {
  /** Refs to add, in the order the source tables are currently selected. */
  toAdd: UnionTableRef[];
  /** Selected table names that do not exist in the target database. */
  missing: string[];
  /** Candidates already in the selection (primary or an existing union). */
  alreadyPresent: UnionTableRef[];
  /** Candidates dropped because the union would exceed MAX_UNION_TABLES. */
  droppedOverLimit: UnionTableRef[];
}

/**
 * What "add this database" would do: mirror the currently selected tables
 * (primary + unions) into `targetDatabase` as union secondaries.
 *
 * Pure, so the picker can resolve it on every render and show the exact
 * outcome before the click. Table lists are stable for a session, so a plan
 * computed from the cache cannot go stale before it is applied.
 */
export function planDatabaseMirror({
  targetDatabase,
  primaryDatabase,
  primaryTable,
  unionTables,
  targetTableNames,
  maxUnionTables = MAX_UNION_TABLES,
}: {
  targetDatabase: string;
  primaryDatabase: string;
  primaryTable: string;
  unionTables: UnionTableRef[];
  targetTableNames: string[];
  maxUnionTables?: number;
}): DatabaseMirrorPlan {
  const plan: DatabaseMirrorPlan = {
    toAdd: [],
    missing: [],
    alreadyPresent: [],
    droppedOverLimit: [],
  };
  if (!targetDatabase || !primaryTable) return plan;

  const sourceNames: string[] = [];
  [primaryTable, ...unionTables.map((ut) => ut.table_name)].forEach((name) => {
    if (name && !sourceNames.includes(name)) sourceNames.push(name);
  });

  const available = new Set(targetTableNames);
  const selected = new Set(
    unionTables.map((ut) => `${ut.database}\u0000${ut.table_name}`),
  );

  sourceNames.forEach((name) => {
    const ref: UnionTableRef = { database: targetDatabase, table_name: name };
    const isPrimary = targetDatabase === primaryDatabase && name === primaryTable;
    if (isPrimary || selected.has(`${targetDatabase}\u0000${name}`)) {
      plan.alreadyPresent.push(ref);
      return;
    }
    if (!available.has(name)) {
      plan.missing.push(name);
      return;
    }
    if (unionTables.length + plan.toAdd.length >= maxUnionTables) {
      plan.droppedOverLimit.push(ref);
      return;
    }
    plan.toAdd.push(ref);
  });

  return plan;
}

/** Why a keep-tables database switch cannot be performed. */
export type SwitchBlocker =
  | 'no-primary-table'
  | 'same-database'
  | 'primary-table-missing'
  | 'cross-database-union';

/**
 * Whether "switch to this database" can succeed, resolved from the cached
 * table list before the click.
 *
 * `switchDatabasePreserveTables` performs the same primary-table check itself
 * and rolls back on failure; this is the UX affordance, not the safety net.
 *
 * Callers must guard an empty `targetDatabase` themselves: nothing staged is a
 * "pick a database" state, not a blocked switch.
 */
export function planDatabaseSwitch({
  targetDatabase,
  primaryDatabase,
  primaryTable,
  joinedTables,
  unionTables,
  targetTableNames,
}: {
  targetDatabase: string;
  primaryDatabase: string;
  primaryTable: string;
  joinedTables: string[];
  unionTables: UnionTableRef[];
  targetTableNames: string[];
}): { blocker?: SwitchBlocker; missingJoinedTables: string[] } {
  const available = new Set(targetTableNames);
  // Advisory only: the switch proceeds and warns (spec §B step 3).
  const missingJoinedTables = joinedTables.filter((t) => !available.has(t));

  if (!primaryTable) return { blocker: 'no-primary-table', missingJoinedTables };
  if (targetDatabase === primaryDatabase) {
    return { blocker: 'same-database', missingJoinedTables };
  }
  if (hasCrossDatabaseUnion(primaryDatabase, unionTables)) {
    return { blocker: 'cross-database-union', missingJoinedTables };
  }
  if (!available.has(primaryTable)) {
    return { blocker: 'primary-table-missing', missingJoinedTables };
  }
  return { missingJoinedTables };
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
    // New entity plus legacy key for not-yet-migrated snapshots
    addFields(columns, vs.measureGroup?.members);
    addFields(columns, vs.measureGroupFields);
    addColumnName(columns, vs.colorField);
    addColumnName(columns, vs.sizeField);
    addColumnName(columns, vs.shapeField);
    addColumnName(columns, vs.facetBackgroundField);
  });

  return columns;
}

export interface SchemaCheckReadiness {
  selectedTable: string;
  /** Count of REAL columns fetched from the backend — virtual columns must not count. */
  realFieldCount: number;
  isLoadingMetadata: boolean;
  hasJoinsOrUnions: boolean;
  hasVirtualTable: boolean;
}

/**
 * True once the fetched schema has settled enough to judge a restored snapshot.
 *
 * The after-load check runs exactly once, so firing it mid-fetch permanently
 * reports a healthy sheet as broken. Virtual columns are excluded from the field
 * count on purpose: a snapshot restores them in the same batch as the table, so
 * they are present before any real column has been fetched.
 */
export function isSchemaCheckReady({
  selectedTable,
  realFieldCount,
  isLoadingMetadata,
  hasJoinsOrUnions,
  hasVirtualTable,
}: SchemaCheckReadiness): boolean {
  if (!selectedTable || realFieldCount === 0) return false;
  if (isLoadingMetadata) return false;
  // Joins/unions land their merged field set together with virtualTable; without
  // it the fields on hand are only the primary table's.
  if (hasJoinsOrUnions && !hasVirtualTable) return false;
  return true;
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
