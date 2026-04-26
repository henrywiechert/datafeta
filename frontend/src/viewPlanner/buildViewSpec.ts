import { isCdfAllowed } from '../utils/cdfUtils';
import { isMeasureNamesField, isMeasureValuesField } from '../utils/syntheticFields';
import { getQueryTypeFromFields } from '../queryBuilder/queryBuilder';
import { Field } from '../types';
import {
  BuildViewSpecInput,
  DomainPolicyMode,
  MarkFamilyMemberSpec,
  MeasureGroupSpec,
  RenderPlan,
  SelectionSpec,
  ViewGrain,
  ViewSpec,
} from './types';

function withAxis(field: Field, axis: 'x' | 'y'): Field {
  return { ...field, axis };
}

function defaultAggregationFor(field: Field): Field['aggregation'] {
  return field.flavour === 'continuous' ? 'sum' : 'count';
}

function hasAggregatedMeasures(fields: Field[]): boolean {
  return fields.some((field) => field.type === 'measure' && field.aggregation);
}

function normalizeFieldWithDefaultAgg(
  field: Field,
  needsDefaultAgg: boolean,
  referenceFields: Field[],
): Field {
  if (
    field.type === 'measure' &&
    !field.aggregation &&
    needsDefaultAgg &&
    hasAggregatedMeasures(referenceFields)
  ) {
    return { ...field, aggregation: 'sum' };
  }
  return field;
}

function dedupeFieldsById(fields: Field[]): Field[] {
  const out: Field[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    out.push(field);
  }
  return out;
}

function dedupeFieldsByOutputIdentity(fields: Field[]): Field[] {
  const out: Field[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const key = [
      field.columnName,
      field.dateTimePart || '',
      field.dateTimeMode || '',
      field.sourceTable || '',
      field.syntheticType || '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(field);
  }
  return out;
}

function qualifiesForBoxPlotSummaryQuery(xAxisFields: Field[], yAxisFields: Field[]): boolean {
  const axisFields = [...xAxisFields, ...yAxisFields];
  if (axisFields.some((field) => field.type === 'measure')) {
    return false;
  }

  const xContinuous = xAxisFields.filter((field) => field.type === 'dimension' && field.flavour === 'continuous');
  const yContinuous = yAxisFields.filter((field) => field.type === 'dimension' && field.flavour === 'continuous');

  return (xContinuous.length > 0) !== (yContinuous.length > 0);
}

export function buildQueryFieldsFromViewInput(input: BuildViewSpecInput): Field[] {
  const xFields = input.xAxisFields.map((field) => withAxis(field, 'x'));
  const yFields = input.yAxisFields.map((field) => withAxis(field, 'y'));

  const xHasMeasure = xFields.some((field) => field.type === 'measure');
  const yHasMeasure = yFields.some((field) => field.type === 'measure');
  const shouldDefaultAxisMeasureAgg = xHasMeasure !== yHasMeasure;

  const normalizedXFields = shouldDefaultAxisMeasureAgg && xHasMeasure
    ? xFields.map((field) => field.type === 'measure' && !field.aggregation
      ? { ...field, aggregation: defaultAggregationFor(field) }
      : field)
    : xFields;

  const normalizedYFields = shouldDefaultAxisMeasureAgg && yHasMeasure
    ? yFields.map((field) => field.type === 'measure' && !field.aggregation
      ? { ...field, aggregation: defaultAggregationFor(field) }
      : field)
    : yFields;

  const allFields: Field[] = [...normalizedXFields, ...normalizedYFields];
  const axisFields = [...input.xAxisFields, ...input.yAxisFields];
  const singleFields = [
    input.colorField,
    input.sizeField,
    input.shapeField,
    input.facetBackgroundField,
  ].filter((field): field is Field => !!field);

  for (const field of singleFields) {
    const entry = normalizeFieldWithDefaultAgg(field, true, axisFields);
    if (!allFields.some((candidate) => candidate.columnName === entry.columnName)) {
      allFields.push(entry);
    }
  }

  for (const field of [
    ...(input.additionalColorFields || []),
    ...(input.additionalSizeFields || []),
    ...(input.additionalLabelFields || []),
  ]) {
    if (!allFields.some((candidate) => candidate.id === field.id)) {
      allFields.push(normalizeFieldWithDefaultAgg(field, true, axisFields));
    }
  }

  return dedupeFieldsByOutputIdentity([
    ...allFields,
    ...(input.labelFields || []),
  ]);
}

function deriveGrain(input: BuildViewSpecInput, queryFields: Field[]): ViewGrain {
  const axisFields = [...input.xAxisFields, ...input.yAxisFields];

  if (
    input.globalChartType === 'cdf' &&
    isCdfAllowed(input.xAxisFields, input.yAxisFields)
  ) {
    return 'cdf';
  }

  if (
    input.distributionVariant === 'box-plot' &&
    qualifiesForBoxPlotSummaryQuery(input.xAxisFields, input.yAxisFields)
  ) {
    return 'boxPlotSummary';
  }

  if (axisFields.some((field) => isMeasureValuesField(field) || isMeasureNamesField(field))) {
    return 'measureGroupLongForm';
  }

  return getQueryTypeFromFields(queryFields) === 'aggregated' ? 'grouped' : 'rawRows';
}

function queryModeForGrain(grain: ViewGrain): ViewSpec['queryMode'] {
  if (grain === 'cdf') return 'cdf';
  if (grain === 'boxPlotSummary') return 'box_plot';
  if (grain === 'grouped' || grain === 'measureGroupLongForm') return 'aggregated';
  return 'raw';
}

function deriveDomainPolicy(input: BuildViewSpecInput, hasMeasureGroup: boolean) {
  const policyFor = (axis: 'x' | 'y'): DomainPolicyMode => {
    if (input.independentDomains?.[axis]) return 'independent';
    if (hasMeasureGroup) return 'measureGroupShared';
    return 'shared';
  };

  return {
    x: policyFor('x'),
    y: policyFor('y'),
  };
}

function buildMeasureGroupSpec(input: BuildViewSpecInput): MeasureGroupSpec[] {
  const fields = dedupeFieldsById(input.measureGroupFields || []);
  const sourceFields = input.measureValuesSourceFields?.length
    ? input.measureValuesSourceFields
    : fields;

  if (fields.length === 0 && sourceFields.length === 0) {
    return [];
  }

  const members: MarkFamilyMemberSpec[] = sourceFields.map((field) => {
    const override = input.fieldOverrides?.[field.id];
    return {
      field,
      aggregation: field.aggregation || 'sum',
      markType: override?.chartType,
      manualColor: override?.manualColor,
      colorField: override?.colorField,
      sizeField: override?.sizeField,
      labelFields: override?.labelFields,
      domainPolicy: 'measureGroupShared',
    };
  });

  const incompatibleMembers = members.filter((member) => member.field.flavour !== 'continuous');

  return [{
    kind: 'measureGroup',
    fields,
    members,
    usesSyntheticMeasureValues: [...input.xAxisFields, ...input.yAxisFields].some(isMeasureValuesField),
    compatibility: {
      canSharePane: incompatibleMembers.length === 0,
      reasons: incompatibleMembers.map((member) => `${member.field.columnName} is not continuous`),
    },
  }];
}

function buildSelectionSpecs(input: BuildViewSpecInput): SelectionSpec[] {
  const filterConfigs = input.appliedFilterConfigurations || input.filterConfigurations || {};
  return Object.entries(filterConfigs)
    .filter(([, config]) => config.isZoomFilter)
    .map(([id, config]) => ({
      id,
      kind: config.type === 'discrete' ? 'category' : 'range',
      source: 'brush',
      filter: config,
      appliesAsFilter: true,
    }));
}

export function buildViewSpec(input: BuildViewSpecInput): ViewSpec {
  const xDiscrete = input.xAxisFields.filter((field) => field.flavour === 'discrete');
  const yDiscrete = input.yAxisFields.filter((field) => field.flavour === 'discrete');
  const xInPane = input.xAxisFields.filter((field) => field.flavour === 'continuous' || field.type === 'measure');
  const yInPane = input.yAxisFields.filter((field) => field.flavour === 'continuous' || field.type === 'measure');
  const queryFields = buildQueryFieldsFromViewInput(input);
  const measureGroups = buildMeasureGroupSpec(input);
  const grain = deriveGrain(input, queryFields);

  return {
    axes: {
      x: input.xAxisFields,
      y: input.yAxisFields,
    },
    panePartition: {
      rows: yDiscrete,
      columns: xDiscrete,
    },
    inPaneAxes: {
      x: xInPane,
      y: yInPane,
    },
    encodings: {
      color: input.colorField || null,
      size: input.sizeField || null,
      shape: input.shapeField || null,
      label: input.labelFields || [],
      tooltip: input.tooltipFields || [],
      facetBackground: input.facetBackgroundField || null,
    },
    grain,
    domainPolicy: deriveDomainPolicy(input, measureGroups.length > 0),
    measureGroups,
    selections: buildSelectionSpecs(input),
    queryFields,
    queryMode: queryModeForGrain(grain),
    chart: {
      globalChartType: input.globalChartType,
      distributionVariant: input.distributionVariant,
    },
  };
}

export function buildRenderPlan(viewSpec: ViewSpec): RenderPlan {
  return {
    panePartition: viewSpec.panePartition,
    inPaneAxes: viewSpec.inPaneAxes,
    domainPolicy: viewSpec.domainPolicy,
    facetFields: [
      ...viewSpec.panePartition.rows,
      ...viewSpec.panePartition.columns,
    ],
  };
}
