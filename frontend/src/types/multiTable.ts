/**
 * Multi-Table Support Types
 * JOIN and UNION table definitions
 */

export interface ForeignKeyRelationship {
  from_table: string;
  from_columns: string[];
  to_table: string;
  to_columns: string[];
  relationship_type: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

export interface TableJoinDefinition {
  table_name: string;
  join_type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  on_conditions: string[];
  alias?: string;
  enforce_unique_keys?: boolean;
  dedup_key_columns?: string[];
}

export interface UnionTableDefinition {
  table_name: string;
  database?: string;  // Optional database name for cross-database unions
  filter_condition?: string;
}

export interface VirtualTableDefinition {
  primary_table: string;
  mode: 'join' | 'union';
  joined_tables: TableJoinDefinition[];
  union_tables: UnionTableDefinition[];
  name?: string;
}

export interface TableRelationshipsResponse {
  relationships: ForeignKeyRelationship[];
}

export interface SuggestedJoinsResponse {
  primary_table: string;
  suggested_tables: string[];
}

export interface SuggestedUnionsResponse {
  primary_table: string;
  suggested_tables: string[];
  schema_hash?: string;
}

export interface MergedColumnsResponse {
  columns: import('./database').Column[];
  virtual_table: VirtualTableDefinition;
}
