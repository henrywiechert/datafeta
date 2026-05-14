// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
