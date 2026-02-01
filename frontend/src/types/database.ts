/**
 * Database, Table, and Column types
 * Core data source metadata types
 */

export interface Database {
  name: string;
}

export interface Table {
  name: string;
}

export interface Column {
  name: string;
  data_type: string;
  table_name?: string;  // Source table for this column (for multi-table support)
  is_virtual?: boolean;  // Flag for virtual/calculated columns
}
