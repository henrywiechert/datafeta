/**
 * Types - Centralized type definitions
 * 
 * This file re-exports all types from the types/ directory for backward compatibility.
 * New code can import directly from './types' or from specific type files in './types/'.
 * 
 * Type files are organized by domain:
 * - database.ts: Database, Table, Column
 * - virtualColumn.ts: VirtualColumnDefinition, BinnedFieldDefinition
 * - multiTable.ts: JOIN/UNION table definitions
 * - kaggle.ts: Kaggle dataset types
 * - connection.ts: ConnectionDetails, list responses
 * - field.ts: Field, FieldType, Aggregation, etc.
 * - query.ts: QueryDescription, QueryResult, optimization types
 * - filter.ts: FilterConfig, FilterMetadata
 * - sheet.ts: Sheet, VisualizationStateSnapshot
 * - savedConfig.ts: SavedConfiguration, SnapshotMetadata
 */

// Re-export everything from the types directory
export * from './types/index';
