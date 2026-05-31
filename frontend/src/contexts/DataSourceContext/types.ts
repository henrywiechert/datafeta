// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  Database,
  Table,
  Field,
  VirtualTableDefinition,
  VirtualColumnDefinition,
  FilterConfig,
  FilterMetadata,
  ForeignKeyRelationship,
} from '../../types';

export type VirtualColumnPreference = {
  type?: 'dimension' | 'measure';
  flavour?: 'discrete' | 'continuous';
  aggregation?: string;
};

export interface DataSourceState {
  // ----- METADATA slice -----
  selectedDatabase: string;
  selectedTable: string;
  availableFields: Field[];
  databases: Database[];
  tables: Table[];
  tablesCache: Record<string, Table[]>;
  isLoadingMetadata: boolean;
  metadataError: string | null;

  // ----- MEASURE-GROUP slice -----
  // Session-scoped measure groups used to rebuild availableFields with
  // synthetic MeasureNames/MeasureValues fields. VisualizationContext owns the
  // per-sheet selection; this lives here only because availableFields is
  // session-scoped.
  measureGroupFields: Field[];

  // ----- MULTI-TABLE slice -----
  joinedTables: string[];
  suggestedJoinableTables: string[];
  unionTables: Array<{ database: string; table_name: string }>;
  suggestedUnionableTables: string[]; // DEPRECATED, kept for backward compat
  virtualTable: VirtualTableDefinition | null;
  customRelationships: ForeignKeyRelationship[] | null;

  // ----- VIRTUAL-COLUMNS / aliases (small, kept on the root) -----
  virtualColumns: VirtualColumnDefinition[];
  virtualColumnFieldPreferences: Record<string, VirtualColumnPreference>;
  fieldDisplayAliases: Record<string, string>;

  // ----- SESSION-FILTERS slice -----
  sessionFilterFields: Field[];
  sessionFilterConfigurations: Record<string, FilterConfig>;
  sessionAppliedFilterConfigurations: Record<string, FilterConfig>;
  sessionFilterMetadata: Record<string, FilterMetadata>;

  // ----- HIVE-PARTITION slice -----
  hivePartitionFiles: Map<string, File[]>;
  loadedPartitions: Set<string>;
  isLoadingPartition: boolean;
  partitionLoadError: string | null;
}

export const initialDataSourceState: DataSourceState = {
  selectedDatabase: '',
  selectedTable: '',
  availableFields: [],
  databases: [],
  tables: [],
  tablesCache: {},
  isLoadingMetadata: false,
  metadataError: null,
  measureGroupFields: [],
  joinedTables: [],
  suggestedJoinableTables: [],
  unionTables: [],
  suggestedUnionableTables: [],
  virtualTable: null,
  customRelationships: null,
  virtualColumns: [],
  virtualColumnFieldPreferences: {},
  fieldDisplayAliases: {},
  sessionFilterFields: [],
  sessionFilterConfigurations: {},
  sessionAppliedFilterConfigurations: {},
  sessionFilterMetadata: {},
  hivePartitionFiles: new Map(),
  loadedPartitions: new Set(),
  isLoadingPartition: false,
  partitionLoadError: null,
};

// Discriminated union of all actions, grouped by slice.
export type DataSourceAction =
  // ----- METADATA -----
  | { type: 'SET_SELECTED_DATABASE'; payload: string }
  | { type: 'SET_SELECTED_TABLE'; payload: string }
  | { type: 'SET_AVAILABLE_FIELDS'; payload: Field[] }
  | { type: 'SET_DATABASES'; payload: Database[] }
  | { type: 'SET_TABLES'; payload: Table[] }
  | { type: 'SET_TABLES_FOR_DATABASE'; payload: { database: string; tables: Table[] } }
  | { type: 'SET_IS_LOADING_METADATA'; payload: boolean }
  | { type: 'SET_METADATA_ERROR'; payload: string | null }
  | { type: 'RESET_METADATA' }
  // ----- MEASURE-GROUP -----
  | { type: 'SET_MEASURE_GROUP_FIELDS'; payload: Field[] }
  | { type: 'ADD_MEASURE_TO_GROUP'; payload: Field }
  | { type: 'REMOVE_MEASURES_FROM_GROUP'; payload: string[] }
  | { type: 'CLEAR_MEASURE_GROUP' }
  // ----- MULTI-TABLE -----
  | { type: 'SET_JOINED_TABLES'; payload: string[] }
  | { type: 'SET_SUGGESTED_JOINABLE_TABLES'; payload: string[] }
  | { type: 'SET_UNION_TABLES'; payload: Array<{ database: string; table_name: string }> }
  | { type: 'SET_SUGGESTED_UNIONABLE_TABLES'; payload: string[] }
  | { type: 'SET_VIRTUAL_TABLE'; payload: VirtualTableDefinition | null }
  | { type: 'TOGGLE_JOINED_TABLE'; payload: string }
  | { type: 'ADD_UNION_TABLE'; payload: { database: string; tableName: string } }
  | { type: 'REMOVE_UNION_TABLE'; payload: { database: string; tableName: string } }
  | { type: 'SET_CUSTOM_RELATIONSHIPS'; payload: ForeignKeyRelationship[] | null }
  // ----- VIRTUAL-COLUMNS / aliases -----
  | { type: 'SET_VIRTUAL_COLUMNS'; payload: VirtualColumnDefinition[] }
  | { type: 'ADD_VIRTUAL_COLUMN'; payload: VirtualColumnDefinition }
  | { type: 'UPDATE_VIRTUAL_COLUMN'; payload: { index: number; column: VirtualColumnDefinition } }
  | { type: 'REMOVE_VIRTUAL_COLUMN'; payload: number }
  | { type: 'SET_VC_FIELD_PREFERENCE'; payload: { columnName: string; preference: VirtualColumnPreference } }
  | { type: 'SET_VC_FIELD_PREFERENCES'; payload: Record<string, VirtualColumnPreference> }
  | { type: 'SET_FIELD_ALIAS'; payload: { columnName: string; alias: string | undefined } }
  | { type: 'CLEAR_ALL_FIELD_ALIASES' }
  // ----- SESSION-FILTERS -----
  | { type: 'SET_SESSION_FILTER_FIELDS'; payload: Field[] }
  | { type: 'ADD_SESSION_FILTER_FIELD'; payload: Field }
  | { type: 'REMOVE_SESSION_FILTER_FIELD'; payload: string }
  | { type: 'SET_SESSION_FILTER_CONFIG'; payload: { fieldId: string; config: FilterConfig } }
  | { type: 'SET_AND_APPLY_SESSION_FILTER_CONFIG'; payload: { fieldId: string; config: FilterConfig } }
  | { type: 'REMOVE_SESSION_FILTER_CONFIG'; payload: string }
  | { type: 'APPLY_SESSION_FILTERS' }
  | { type: 'SET_SESSION_FILTER_METADATA'; payload: { fieldId: string; metadata: FilterMetadata } }
  | { type: 'CLEAR_SESSION_FILTERS' }
  | {
      type: 'RESTORE_SESSION_FILTERS';
      payload: { fields: Field[]; configurations: Record<string, FilterConfig> };
    }
  // ----- HIVE-PARTITION -----
  | { type: 'SET_HIVE_PARTITION_FILES'; payload: Map<string, File[]> }
  | { type: 'HIVE_PARTITION_LOAD_START' }
  | {
      type: 'HIVE_PARTITION_LOAD_SUCCESS';
      payload: {
        partitionName: string;
        fields: Field[];
        setAsPrimary: boolean;
      };
    }
  | { type: 'HIVE_PARTITION_LOAD_ERROR'; payload: string }
  | { type: 'CLEAR_HIVE_PARTITION_STATE' };
