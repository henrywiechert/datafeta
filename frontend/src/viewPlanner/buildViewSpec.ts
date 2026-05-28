// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { isCdfAllowed } from '../utils/cdfUtils';
import { isDensityAllowed } from '../utils/densityUtils';
import { isMeasureNamesField, isMeasureValuesField } from '../utils/syntheticFields';
import { getQueryTypeFromFields } from '../queryBuilder/queryBuilder';
import { getResultColumnName } from '../utils/fieldUtils';
import { Field } from '../types';
import {
  BuildViewSpecInput,
  DomainPolicyMode,
  MarkFamilyCompatibilityIssue,
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

function getFieldOutputIdentity(field: Field): string {
  return [
    getResultColumnName(field),
    field.sourceTable || '',
    field.syntheticType || '',
  ].join('|');
}

function dedupeFieldsByOutputIdentity(fields: Field[]): Field[] {
  const out: Field[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const key = getFieldOutputIdentity(field);
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
  const shouldDefaultAxisMeasureAgg = input.globalChartType === 'pie'
    ? (xHasMeasure || yHasMeasure)
    : xHasMeasure !== yHasMeasure;

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
    if (!allFields.some((candidate) => getFieldOutputIdentity(candidate) === getFieldOutputIdentity(entry))) {
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
    input.globalChartType === 'density' &&
    isDensityAllowed(input.xAxisFields, input.yAxisFields)
  ) {
    return 'rawRows';
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

const SUPPORTED_MEASURE_GROUP_MARK_TYPES = new Set(['bar', 'line', 'scatter', 'tick']);

function getMeasureValuesAxis(input: BuildViewSpecInput): 'x' | 'y' | null {
  const onX = input.xAxisFields.some(isMeasureValuesField);
  const onY = input.yAxisFields.some(isMeasureValuesField);
  if (onX === onY) return null;
  return onX ? 'x' : 'y';
}

function buildMeasureGroupCompatibility(args: {
  input: BuildViewSpecInput;
  members: MarkFamilyMemberSpec[];
  valueAxis: 'x' | 'y' | null;
  comparisonAxis: 'x' | 'y' | null;
}): MarkFamilyCompatibilityIssue[] {
  const { input, members, valueAxis, comparisonAxis } = args;
  const issues: MarkFamilyCompatibilityIssue[] = [];

  if (!valueAxis) {
    issues.push({
      code: 'measure_values_missing',
      severity: 'error',
      message: 'MeasureValues must be placed on exactly one positional axis for a Measure Group mark family.',
    });
  }

  if (members.length < 2) {
    issues.push({
      code: 'too_few_measures',
      severity: 'warning',
      message: 'A Measure Group mark family is most useful with at least two source measures.',
    });
  }

  for (const member of members) {
    if (member.field.type !== 'measure') {
      issues.push({
        code: 'non_measure_member',
        severity: 'error',
        message: `${member.field.columnName} is not a measure.`,
      });
    }
    if (member.field.flavour !== 'continuous') {
      issues.push({
        code: 'non_continuous_member',
        severity: 'error',
        message: `${member.field.columnName} is not continuous.`,
      });
    }
    if (member.markType && !SUPPORTED_MEASURE_GROUP_MARK_TYPES.has(member.markType)) {
      issues.push({
        code: 'unsupported_mark_type',
        severity: 'error',
        message: `${member.field.columnName} uses unsupported Measure Group mark type "${member.markType}".`,
      });
    }
  }

  if (comparisonAxis && input.independentDomains?.[comparisonAxis]) {
    issues.push({
      code: 'independent_comparison_domain',
      severity: 'error',
      message: `Measure Group comparison axis ${comparisonAxis.toUpperCase()} must use a shared domain.`,
    });
  }

  return issues;
}

function buildMeasureGroupSpec(input: BuildViewSpecInput): MeasureGroupSpec[] {
  const fields = dedupeFieldsById(input.measureGroupFields || []);
  const sourceFields = input.measureValuesSourceFields?.length
    ? input.measureValuesSourceFields
    : fields;

  if (fields.length === 0 && sourceFields.length === 0) {
    return [];
  }

  const valueAxis = getMeasureValuesAxis(input);
  const comparisonAxis = valueAxis === 'x' ? 'y' : valueAxis === 'y' ? 'x' : null;
  const comparisonFields = comparisonAxis === 'x'
    ? input.xAxisFields.filter((field) => !isMeasureValuesField(field))
    : comparisonAxis === 'y'
      ? input.yAxisFields.filter((field) => !isMeasureValuesField(field))
      : [];
  const valueDomainPolicy: DomainPolicyMode = valueAxis && input.independentDomains?.[valueAxis]
    ? 'independent'
    : 'measureGroupShared';
  const comparisonDomainPolicy: DomainPolicyMode = comparisonAxis && input.independentDomains?.[comparisonAxis]
    ? 'independent'
    : 'shared';

  const members: MarkFamilyMemberSpec[] = sourceFields.map((field) => {
    const override = input.fieldOverrides?.[field.id];
    return {
      field,
      valueAxis,
      aggregation: field.aggregation || 'sum',
      markType: override?.chartType,
      manualColor: override?.manualColor,
      colorField: override?.colorField,
      sizeField: override?.sizeField,
      labelFields: override?.labelFields,
      domainPolicy: valueDomainPolicy,
    };
  });

  const issues = buildMeasureGroupCompatibility({
    input,
    members,
    valueAxis,
    comparisonAxis,
  });
  const errorIssues = issues.filter((issue) => issue.severity === 'error');

  return [{
    kind: 'measureGroup',
    fields,
    members,
    usesSyntheticMeasureValues: [...input.xAxisFields, ...input.yAxisFields].some(isMeasureValuesField),
    valueAxis,
    comparisonAxis,
    comparisonFields,
    domainPolicy: {
      comparison: comparisonDomainPolicy,
      value: valueDomainPolicy,
    },
    compatibility: {
      canSharePane: errorIssues.length === 0,
      reasons: issues.map((issue) => issue.message),
      issues,
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
