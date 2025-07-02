// Types mirroring backend models

export interface Database {
    name: string;
}

export interface Table {
    name: string;
}

export interface Column {
    name: string;
    data_type: string;
}

// Request body for /connect endpoint
export interface ConnectionDetails {
    type: 'csv' | 'clickhouse';
    file_path?: string;
    connection_string?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
}

// Response types for list endpoints
export interface DatabaseListResponse {
    databases: Database[];
}

export interface TableListResponse {
    tables: Table[];
}

export interface ColumnListResponse {
    columns: Column[];
}

// --- Query API Types --- //

export interface Measure {
    field: string;
    aggregation: 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max';
    alias: string;
}

export interface Filter {
    field: string;
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not in' | 'like' | 'ilike' | 'is null' | 'is not null';
    value: any;
}

export interface OrderBy {
    field: string;
    direction?: 'asc' | 'desc';
}

export interface Dimension {
    field: string;
    flavour: Flavour;
}

export interface QueryDescription {
    target_table: string;
    target_database?: string;
    dimensions?: Dimension[];
    measures?: Measure[];
    filters?: Filter[];
    orderBy?: OrderBy[];
    limit?: number;
    offset?: number;
}

export interface QueryResultColumn {
    name: string;
    type: string;
}

export interface QueryResult {
    columns: QueryResultColumn[];
    rows: { [key: string]: any }[];
    row_count: number;
    query_sql?: string;
    error?: string;
}

// --- New Types for Draggable Fields ---

export type FieldType = 'dimension' | 'measure';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';
export type Flavour = 'discrete' | 'continuous';
export type DataType = 'string' | 'integer' | 'float' | 'datetime';
export type DragSource = 'X_AXIS' | 'Y_AXIS' | 'AVAILABLE_FIELDS';

export interface Field {
  id: string; // A unique ID for each chip instance
  columnName: string;
  type: FieldType;
  aggregation?: Aggregation; // Optional, as dimensions don't have it
  flavour: Flavour;
  dataType: DataType;
}