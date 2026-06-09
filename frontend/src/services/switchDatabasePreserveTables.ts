// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { apiService } from '../apiService';
import { Field, ForeignKeyRelationship, Sheet, VirtualColumnDefinition } from '../types';
import { processColumnsResponse } from '../utils/fieldUtils';
import { buildValidColumnNames, validateAxisFields } from '../utils/axisFieldValidation';
import {
  rewriteUnionTablesForDatabase,
  SchemaCheckResult,
  validateSheetSchema,
} from '../utils/schemaValidation';

type UnionTableRef = { database: string; table_name: string };

export class DatabaseSwitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseSwitchError';
  }
}

export interface SwitchDatabasePreserveTablesParams {
  oldDatabase: string;
  newDatabase: string;
  selectedTable: string;
  joinedTables: string[];
  unionTables: UnionTableRef[];
  customRelationships: ForeignKeyRelationship[] | null;
  fieldDisplayAliases: Record<string, string>;
  measureGroupFields: Field[];
  xAxisFields: Field[];
  yAxisFields: Field[];
  virtualColumns: VirtualColumnDefinition[];
  sheets: Sheet[];
  sessionFilterFields: Field[];
  setSelectedDatabase: (database: string) => void;
  setUnionTables: (tables: UnionTableRef[]) => void;
  setTables: (tables: Array<{ name: string }>) => void;
  setTablesForDatabase?: (database: string, tables: Array<{ name: string }>) => void;
  setAvailableFields: (fields: Field[]) => void;
  setVirtualTable: (virtualTable: unknown | null) => void;
  setIsLoadingMetadata: (loading: boolean) => void;
  setMetadataError: (error: string | null) => void;
  setMeasureGroupFields: (fields: Field[]) => void;
  patchAxisFields: (x: Field[], y: Field[]) => void;
  onUpdateConnectionDatabase?: (database: string) => void;
}

export async function switchDatabasePreserveTables(
  params: SwitchDatabasePreserveTablesParams,
): Promise<SchemaCheckResult> {
  const {
    oldDatabase,
    newDatabase,
    selectedTable,
    joinedTables,
    unionTables,
    customRelationships,
    fieldDisplayAliases,
    measureGroupFields,
    xAxisFields,
    yAxisFields,
    virtualColumns,
    sheets,
    sessionFilterFields,
    setSelectedDatabase,
    setUnionTables,
    setTables,
    setTablesForDatabase,
    setAvailableFields,
    setVirtualTable,
    setIsLoadingMetadata,
    setMetadataError,
    setMeasureGroupFields,
    patchAxisFields,
    onUpdateConnectionDatabase,
  } = params;

  if (!selectedTable) {
    throw new DatabaseSwitchError('No table selected to preserve.');
  }

  if (newDatabase === oldDatabase) {
    throw new DatabaseSwitchError('Already using this database.');
  }

  const rewrittenUnions = rewriteUnionTablesForDatabase(
    unionTables,
    oldDatabase,
    newDatabase,
  );

  setIsLoadingMetadata(true);
  setMetadataError(null);

  try {
    setSelectedDatabase(newDatabase);
    if (rewrittenUnions.length > 0) {
      setUnionTables(rewrittenUnions);
    }
    onUpdateConnectionDatabase?.(newDatabase);

    setTables([]);
    setAvailableFields([]);

    const tablesResponse = await apiService.listTables(newDatabase);
    const tables = tablesResponse.tables || [];
    setTables(tables);
    setTablesForDatabase?.(newDatabase, tables);

    const tableNames = tables.map((t) => t.name);
    if (!tableNames.includes(selectedTable)) {
      setSelectedDatabase(oldDatabase);
      setTables([]);
      if (rewrittenUnions.length > 0) {
        setUnionTables(unionTables);
      }
      onUpdateConnectionDatabase?.(oldDatabase);
      throw new DatabaseSwitchError(
        `Table "${selectedTable}" not found in database "${newDatabase}".`,
      );
    }

    let allFields: Field[] = [];

    if (joinedTables.length === 0 && rewrittenUnions.length === 0) {
      const response = await apiService.listColumns(selectedTable, newDatabase);
      const processed = processColumnsResponse(response.columns, measureGroupFields, {
        fieldDisplayAliases,
      });
      allFields = processed.allFields;
      setMeasureGroupFields(processed.nextMeasureGroupFields);
      setAvailableFields(allFields);
      setVirtualTable(null);
    } else if (rewrittenUnions.length > 0) {
      const response = await apiService.getMergedColumns(
        newDatabase,
        selectedTable,
        undefined,
        rewrittenUnions,
        false,
      );
      const processed = processColumnsResponse(response.columns, measureGroupFields, {
        includeTableName: true,
      });
      allFields = processed.allFields;
      setMeasureGroupFields(processed.nextMeasureGroupFields);
      setAvailableFields(allFields);
      setVirtualTable(response.virtual_table);
    } else {
      const response = await apiService.getMergedColumns(
        newDatabase,
        selectedTable,
        joinedTables,
        undefined,
        false,
        customRelationships ?? undefined,
      );
      const processed = processColumnsResponse(response.columns, measureGroupFields);
      allFields = processed.allFields;
      setMeasureGroupFields(processed.nextMeasureGroupFields);
      setAvailableFields(allFields);
      setVirtualTable(response.virtual_table);
    }

    const validNames = buildValidColumnNames(allFields, virtualColumns);
    const { patchedX, patchedY } = validateAxisFields(xAxisFields, yAxisFields, validNames);
    patchAxisFields(patchedX, patchedY);

    return validateSheetSchema(
      sheets,
      allFields,
      joinedTables,
      tableNames,
      sessionFilterFields,
      virtualColumns,
    );
  } catch (err) {
    if (err instanceof DatabaseSwitchError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Database switch failed';
    setMetadataError(message);
    throw err;
  } finally {
    setIsLoadingMetadata(false);
  }
}
