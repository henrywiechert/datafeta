// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { generateSyntheticFieldsForGroup } from '../../utils/syntheticFields';
import { DataSourceAction, DataSourceState, initialDataSourceState } from './types';

const getBaseFields = (fields: Field[]) => fields.filter((field) => !field.isSynthetic);

const rebuildAvailableFieldsForGroup = (
  fields: Field[],
  measureGroupFields: Field[],
) => {
  const baseFields = getBaseFields(fields);
  if (baseFields.length === 0) return fields;
  const measureNames = measureGroupFields.map((field) => field.columnName);
  const syntheticFields = generateSyntheticFieldsForGroup(baseFields, measureNames);
  return [...baseFields, ...syntheticFields];
};

export function dataSourceReducer(
  state: DataSourceState,
  action: DataSourceAction,
): DataSourceState {
  switch (action.type) {
    // ============================================================
    // METADATA slice
    // ============================================================
    case 'SET_SELECTED_DATABASE':
      return { ...state, selectedDatabase: action.payload };

    case 'SET_SELECTED_TABLE':
      // Changing the primary table resets the entire multi-table relationship
      // graph; otherwise stale joins/unions would silently apply to a new
      // table that doesn't have those relationships.
      return {
        ...state,
        selectedTable: action.payload,
        joinedTables: [],
        suggestedJoinableTables: [],
        unionTables: [],
        suggestedUnionableTables: [],
        virtualTable: null,
        customRelationships: null,
      };

    case 'SET_AVAILABLE_FIELDS':
      return { ...state, availableFields: action.payload };

    case 'SET_DATABASES':
      return { ...state, databases: action.payload };

    case 'SET_TABLES':
      return {
        ...state,
        tables: action.payload,
        tablesCache: state.selectedDatabase
          ? { ...state.tablesCache, [state.selectedDatabase]: action.payload }
          : state.tablesCache,
      };

    case 'SET_TABLES_FOR_DATABASE':
      return {
        ...state,
        tablesCache: {
          ...state.tablesCache,
          [action.payload.database]: action.payload.tables,
        },
      };

    case 'SET_IS_LOADING_METADATA':
      return { ...state, isLoadingMetadata: action.payload };

    case 'SET_METADATA_ERROR':
      return { ...state, metadataError: action.payload };

    case 'RESET_METADATA':
      // Note: virtualColumns and virtualColumnFieldPreferences are intentionally
      // preserved across connections — users may reuse them.
      return {
        ...state,
        databases: [],
        tables: [],
        tablesCache: {},
        selectedDatabase: '',
        selectedTable: '',
        availableFields: [],
        isLoadingMetadata: false,
        metadataError: null,
        measureGroupFields: [],
        joinedTables: [],
        suggestedJoinableTables: [],
        unionTables: [],
        suggestedUnionableTables: [],
        virtualTable: null,
        customRelationships: null,
        sessionFilterFields: [],
        sessionFilterConfigurations: {},
        sessionAppliedFilterConfigurations: {},
        sessionFilterMetadata: {},
        hivePartitionFiles: new Map(),
        loadedPartitions: new Set(),
        isLoadingPartition: false,
        partitionLoadError: null,
      };

    // ============================================================
    // MEASURE-GROUP slice
    // ============================================================
    case 'SET_MEASURE_GROUP_FIELDS':
      return {
        ...state,
        measureGroupFields: action.payload,
        availableFields: rebuildAvailableFieldsForGroup(state.availableFields, action.payload),
      };

    case 'ADD_MEASURE_TO_GROUP': {
      if (
        state.measureGroupFields.some(
          (item) => item.columnName === action.payload.columnName,
        )
      ) {
        return state;
      }
      const nextFields = [...state.measureGroupFields, action.payload];
      return {
        ...state,
        measureGroupFields: nextFields,
        availableFields: rebuildAvailableFieldsForGroup(state.availableFields, nextFields),
      };
    }

    case 'REMOVE_MEASURES_FROM_GROUP': {
      const idSet = new Set(action.payload);
      const nextFields = state.measureGroupFields.filter((item) => !idSet.has(item.id));
      return {
        ...state,
        measureGroupFields: nextFields,
        availableFields: rebuildAvailableFieldsForGroup(state.availableFields, nextFields),
      };
    }

    case 'CLEAR_MEASURE_GROUP':
      return {
        ...state,
        measureGroupFields: [],
        availableFields: rebuildAvailableFieldsForGroup(state.availableFields, []),
      };

    // ============================================================
    // MULTI-TABLE slice
    // ============================================================
    case 'SET_JOINED_TABLES':
      return { ...state, joinedTables: action.payload };

    case 'SET_SUGGESTED_JOINABLE_TABLES':
      return { ...state, suggestedJoinableTables: action.payload };

    case 'SET_UNION_TABLES':
      return { ...state, unionTables: action.payload };

    case 'SET_SUGGESTED_UNIONABLE_TABLES':
      return { ...state, suggestedUnionableTables: action.payload };

    case 'SET_VIRTUAL_TABLE':
      return { ...state, virtualTable: action.payload };

    case 'TOGGLE_JOINED_TABLE': {
      const isCurrentlyJoined = state.joinedTables.includes(action.payload);
      return {
        ...state,
        joinedTables: isCurrentlyJoined
          ? state.joinedTables.filter((t) => t !== action.payload)
          : [...state.joinedTables, action.payload],
      };
    }

    case 'ADD_UNION_TABLE': {
      const { database, tableName } = action.payload;
      const exists = state.unionTables.some(
        (ut) => ut.database === database && ut.table_name === tableName,
      );
      if (exists) return state;
      return {
        ...state,
        unionTables: [...state.unionTables, { database, table_name: tableName }],
      };
    }

    case 'REMOVE_UNION_TABLE': {
      const { database, tableName } = action.payload;
      return {
        ...state,
        unionTables: state.unionTables.filter(
          (ut) => !(ut.database === database && ut.table_name === tableName),
        ),
      };
    }

    case 'SET_CUSTOM_RELATIONSHIPS':
      return { ...state, customRelationships: action.payload };

    // ============================================================
    // VIRTUAL-COLUMNS / aliases
    // ============================================================
    case 'SET_VIRTUAL_COLUMNS':
      return { ...state, virtualColumns: action.payload };

    case 'ADD_VIRTUAL_COLUMN':
      return { ...state, virtualColumns: [...state.virtualColumns, action.payload] };

    case 'UPDATE_VIRTUAL_COLUMN': {
      const { index, column } = action.payload;
      if (index < 0 || index >= state.virtualColumns.length) return state;
      const next = [...state.virtualColumns];
      next[index] = column;
      return { ...state, virtualColumns: next };
    }

    case 'REMOVE_VIRTUAL_COLUMN': {
      const index = action.payload;
      if (index < 0 || index >= state.virtualColumns.length) return state;
      const removed = state.virtualColumns[index];
      const nextPrefs = { ...state.virtualColumnFieldPreferences };
      if (removed?.name) delete nextPrefs[removed.name];
      return {
        ...state,
        virtualColumns: state.virtualColumns.filter((_, i) => i !== index),
        virtualColumnFieldPreferences: nextPrefs,
      };
    }

    case 'SET_VC_FIELD_PREFERENCE': {
      const { columnName, preference } = action.payload;
      if (!columnName) return state;
      return {
        ...state,
        virtualColumnFieldPreferences: {
          ...state.virtualColumnFieldPreferences,
          [columnName]: {
            ...state.virtualColumnFieldPreferences[columnName],
            ...preference,
          },
        },
      };
    }

    case 'SET_VC_FIELD_PREFERENCES':
      return { ...state, virtualColumnFieldPreferences: action.payload || {} };

    case 'SET_FIELD_ALIAS': {
      const { columnName, alias } = action.payload;
      if (!alias) {
        const { [columnName]: _removed, ...rest } = state.fieldDisplayAliases;
        return { ...state, fieldDisplayAliases: rest };
      }
      return {
        ...state,
        fieldDisplayAliases: { ...state.fieldDisplayAliases, [columnName]: alias },
      };
    }

    case 'CLEAR_ALL_FIELD_ALIASES':
      return { ...state, fieldDisplayAliases: {} };

    // ============================================================
    // SESSION-FILTERS slice
    // ============================================================
    case 'SET_SESSION_FILTER_FIELDS':
      return { ...state, sessionFilterFields: action.payload };

    case 'ADD_SESSION_FILTER_FIELD':
      if (state.sessionFilterFields.some((f) => f.id === action.payload.id)) return state;
      return {
        ...state,
        sessionFilterFields: [...state.sessionFilterFields, action.payload],
      };

    case 'REMOVE_SESSION_FILTER_FIELD': {
      const fieldId = action.payload;
      const { [fieldId]: _c, ...remainingConfigs } = state.sessionFilterConfigurations;
      const { [fieldId]: _a, ...remainingApplied } = state.sessionAppliedFilterConfigurations;
      const { [fieldId]: _m, ...remainingMeta } = state.sessionFilterMetadata;
      return {
        ...state,
        sessionFilterFields: state.sessionFilterFields.filter((f) => f.id !== fieldId),
        sessionFilterConfigurations: remainingConfigs,
        sessionAppliedFilterConfigurations: remainingApplied,
        sessionFilterMetadata: remainingMeta,
      };
    }

    case 'SET_SESSION_FILTER_CONFIG':
      return {
        ...state,
        sessionFilterConfigurations: {
          ...state.sessionFilterConfigurations,
          [action.payload.fieldId]: { ...action.payload.config, scope: 'session' as const },
        },
      };

    case 'SET_AND_APPLY_SESSION_FILTER_CONFIG': {
      const sessionConfig = { ...action.payload.config, scope: 'session' as const };
      return {
        ...state,
        sessionFilterConfigurations: {
          ...state.sessionFilterConfigurations,
          [action.payload.fieldId]: sessionConfig,
        },
        sessionAppliedFilterConfigurations: {
          ...state.sessionAppliedFilterConfigurations,
          [action.payload.fieldId]: sessionConfig,
        },
      };
    }

    case 'REMOVE_SESSION_FILTER_CONFIG': {
      const { [action.payload]: _removed, ...remaining } = state.sessionFilterConfigurations;
      return { ...state, sessionFilterConfigurations: remaining };
    }

    case 'APPLY_SESSION_FILTERS':
      return {
        ...state,
        sessionAppliedFilterConfigurations: { ...state.sessionFilterConfigurations },
      };

    case 'SET_SESSION_FILTER_METADATA':
      return {
        ...state,
        sessionFilterMetadata: {
          ...state.sessionFilterMetadata,
          [action.payload.fieldId]: action.payload.metadata,
        },
      };

    case 'CLEAR_SESSION_FILTERS':
      return {
        ...state,
        sessionFilterFields: [],
        sessionFilterConfigurations: {},
        sessionAppliedFilterConfigurations: {},
        sessionFilterMetadata: {},
      };

    case 'RESTORE_SESSION_FILTERS':
      return {
        ...state,
        sessionFilterFields: action.payload.fields,
        sessionFilterConfigurations: action.payload.configurations,
        sessionAppliedFilterConfigurations: action.payload.configurations,
        sessionFilterMetadata: {},
      };

    // ============================================================
    // HIVE-PARTITION slice
    // ============================================================
    case 'SET_HIVE_PARTITION_FILES':
      return { ...state, hivePartitionFiles: action.payload };

    case 'HIVE_PARTITION_LOAD_START':
      return { ...state, isLoadingPartition: true, partitionLoadError: null };

    case 'HIVE_PARTITION_LOAD_SUCCESS': {
      const { partitionName, fields, setAsPrimary } = action.payload;
      const newLoadedPartitions = new Set(state.loadedPartitions);
      newLoadedPartitions.add(partitionName);
      if (setAsPrimary) {
        return {
          ...state,
          loadedPartitions: newLoadedPartitions,
          isLoadingPartition: false,
          selectedTable: partitionName,
          availableFields: fields,
        };
      }
      return {
        ...state,
        loadedPartitions: newLoadedPartitions,
        isLoadingPartition: false,
        unionTables: [...state.unionTables, { database: '', table_name: partitionName }],
      };
    }

    case 'HIVE_PARTITION_LOAD_ERROR':
      return { ...state, isLoadingPartition: false, partitionLoadError: action.payload };

    case 'CLEAR_HIVE_PARTITION_STATE':
      return {
        ...state,
        hivePartitionFiles: new Map(),
        loadedPartitions: new Set(),
        isLoadingPartition: false,
        partitionLoadError: null,
      };

    default:
      // Exhaustiveness check — TypeScript will error here if a new action is
      // added without a case.
      return state;
  }
}

export { initialDataSourceState };
