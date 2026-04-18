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
} from './connection';

// Field types
export type {
  FieldType,
  Aggregation,
  Flavour,
  DataType,
  DateTimePart,
  DateTimeMode,
  DistributionVariant,
  BoxPlotReferenceLineMode,
  DragSource,
  Field,
  DataLabelMode,
  UserChartType,
  FieldOverrideState,
  QueryOptimizationSettings,
} from './field';

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
  DiscreteFilterConfig,
  ContinuousFilterConfig,
  DateTimeFilterConfig,
  FilterConfig,
  DiscreteFilterMetadata,
  ContinuousFilterMetadata,
  DateTimeFilterMetadata,
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
} from './tooltip';

// Saved configuration types
export type {
  SavedConnectionMetadata,
  SavedDataSourceSelection,
  SavedSessionFilters,
  SavedConfiguration,
  SnapshotMetadata,
} from './savedConfig';
