import {
  DistributionVariant,
  Field,
  FieldOverrideState,
  FilterConfig,
  UserChartType,
} from '../types';

export type ViewGrain =
  | 'rawRows'
  | 'grouped'
  | 'cdf'
  | 'boxPlotSummary'
  | 'measureGroupLongForm';

export type DomainPolicyMode =
  | 'shared'
  | 'independent'
  | 'perFacet'
  | 'measureGroupShared';

export interface AxisFieldSet {
  x: Field[];
  y: Field[];
}

export interface PanePartitionSpec {
  rows: Field[];
  columns: Field[];
}

export interface InPaneAxesSpec {
  x: Field[];
  y: Field[];
}

export interface EncodingSpec {
  color: Field | null;
  size: Field | null;
  shape: Field | null;
  label: Field[];
  tooltip: Field[];
  facetBackground: Field | null;
}

export interface DomainPolicySpec {
  x: DomainPolicyMode;
  y: DomainPolicyMode;
}

export interface MarkFamilyMemberSpec {
  field: Field;
  aggregation?: Field['aggregation'];
  markType?: UserChartType;
  manualColor?: string;
  colorField?: Field | null;
  sizeField?: Field | null;
  labelFields?: Field[];
  domainPolicy?: DomainPolicyMode;
}

export interface MeasureGroupSpec {
  kind: 'measureGroup';
  fields: Field[];
  members: MarkFamilyMemberSpec[];
  usesSyntheticMeasureValues: boolean;
  compatibility: {
    canSharePane: boolean;
    reasons: string[];
  };
}

export type SelectionKind = 'range' | 'category' | 'markSet' | 'rowSet';

export interface SelectionSpec {
  id: string;
  kind: SelectionKind;
  source: 'brush' | 'click' | 'external';
  field?: Field;
  filter?: FilterConfig;
  appliesAsFilter: boolean;
}

export interface ViewSpec {
  axes: AxisFieldSet;
  panePartition: PanePartitionSpec;
  inPaneAxes: InPaneAxesSpec;
  encodings: EncodingSpec;
  grain: ViewGrain;
  domainPolicy: DomainPolicySpec;
  measureGroups: MeasureGroupSpec[];
  selections: SelectionSpec[];
  queryFields: Field[];
  queryMode: 'raw' | 'aggregated' | 'cdf' | 'box_plot';
  chart: {
    globalChartType?: UserChartType | null;
    distributionVariant?: DistributionVariant;
  };
}

export interface BuildViewSpecInput {
  xAxisFields: Field[];
  yAxisFields: Field[];
  filterConfigurations?: Record<string, FilterConfig>;
  appliedFilterConfigurations?: Record<string, FilterConfig>;
  colorField?: Field | null;
  sizeField?: Field | null;
  shapeField?: Field | null;
  facetBackgroundField?: Field | null;
  labelFields?: Field[];
  tooltipFields?: Field[];
  measureGroupFields?: Field[];
  measureValuesSourceFields?: Field[];
  additionalColorFields?: Field[];
  additionalSizeFields?: Field[];
  additionalLabelFields?: Field[];
  fieldOverrides?: Record<string, FieldOverrideState>;
  globalChartType?: UserChartType | null;
  distributionVariant?: DistributionVariant;
  independentDomains?: { x?: boolean; y?: boolean };
}

export interface RenderPlan {
  panePartition: PanePartitionSpec;
  inPaneAxes: InPaneAxesSpec;
  domainPolicy: DomainPolicySpec;
  facetFields: Field[];
}
