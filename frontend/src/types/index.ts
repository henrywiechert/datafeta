// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Types Index
 * 
 * Centralized exports for all type definitions.
 * Import from here for convenience: import { Field, QueryResult } from '../types';
 */

// Database and metadata types
export type { Database, Table, Column } from './database';

// Virtual column types
export type { BinnedFieldDefinition, VirtualColumnDefinition } from './virtualColumn';

// Multi-table support types
export type {
  ForeignKeyRelationship,
  TableJoinDefinition,
  UnionTableDefinition,
  VirtualTableDefinition,
  TableRelationshipsResponse,
  SuggestedJoinsResponse,
  SuggestedUnionsResponse,
  MergedColumnsResponse,
} from './multiTable';

// Kaggle types
export type {
  KaggleDataset,
  KaggleFile,
  KaggleSearchResponse,
  KaggleFilesResponse,
} from './kaggle';

// Connection types
export type {
  ConnectionDetails,
  DatabaseListResponse,
  TableListResponse,
  ColumnListResponse,
  PatternMode,
  TableReference,
  PatternMatchedDatabaseTables,
  ClickHousePatternPreviewRequest,
  ClickHousePatternPreviewResponse,
} from './connection';

// Field types
export type {
  FieldType,
  Aggregation,
  Flavour,
  DataType,
  DateTimePart,
  DateTimeMode,
  LineVariant,
  LineColorMode,
  DistributionVariant,
  PieVariant,
  DragSource,
  Field,
  DataLabelMode,
  UserChartType,
  DensityParams,
  TableCellMode,
  FieldOverrideState,
  QueryOptimizationSettings,
} from './field';

export { DEFAULT_DENSITY_PARAMS } from './field';

// Visual encoding channel types
export type {
  ColorChannel,
  SizeChannel,
  ShapeChannel,
  LabelChannel,
  TooltipChannel,
  FacetBackgroundChannel,
  Channels,
} from './channels';

// Query types
export type {
  ColumnCastConfig,
  ColumnCasts,
  Measure,
  Filter,
  OrderBy,
  Dimension,
  ResultBudget,
  CdfField,
  BoxPlotField,
  QueryDescription,
  QueryResultColumn,
  QueryResult,
  FieldOptimizationHint,
  OptimizationHints,
  OptimizationOverride,
  ResultDimensions,
  OptimizationMetadata,
  TableRowsSortModel,
} from './query';

// Filter types
export type {
  FilterType,
  FilterScope,
  DiscreteFilterMatchMode,
  DiscretePatternOperator,
  DiscreteFilterConfig,
  ContinuousFilterConfig,
  DateTimeFilterConfig,
  MeasureFilterConfig,
  FilterConfig,
  DiscreteFilterMetadata,
  ContinuousFilterMetadata,
  DateTimeFilterMetadata,
  MeasureFilterMetadata,
  FilterMetadata,
} from './filter';

// Sheet types
export type {
  XAxisLabelStyle,
  YAxisLabelStyle,
  AxisLabelStyles,
  FacetHeaderLabelStyle,
  FacetTopValuesLabelStyle,
  FacetLeftValuesLabelStyle,
  FacetLabelStyles,
  VisualizationStateSnapshot,
  Sheet,
  SheetManagerState,
  SheetAction,
} from './sheet';

// Tooltip types
export type {
  TooltipField,
  TooltipFilterAction,
  CustomTooltipConfig,
  PinnedTooltipComparison,
  PinnedTooltipComparisonItem,
} from './tooltip';

// Saved configuration types
export type {
  SavedConnectionMetadata,
  SavedDataSourceSelection,
  SavedSessionFilters,
  SavedConfiguration,
  SnapshotMetadata,
} from './savedConfig';
