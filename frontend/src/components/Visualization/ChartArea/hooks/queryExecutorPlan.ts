import { Field, QueryDescription, QueryOptimizationSettings, DistributionVariant, QueryResult } from '../../../../types';
import { classifyChartType, computePointBudget } from '../../../../services/chartTypeClassifier';
import { validateAndCleanData, remapCastExpressionColumns } from '../utils/dataValidation';

export interface SamplingBudget {
  maxPoints: number;
  shouldAttachBudget: boolean;
  lineBudgetMaxRows?: number;
}

export function prepareBudgetedQuery(args: {
  queryDesc: QueryDescription;
  colorField: Field | null;
  distributionVariant: DistributionVariant;
  optimizationSettings?: QueryOptimizationSettings;
}) {
  const { queryDesc, colorField, distributionVariant, optimizationSettings } = args;
  const classification = classifyChartType(queryDesc, colorField, distributionVariant);
  const pointBudget = computePointBudget(classification, queryDesc, colorField, optimizationSettings);

  const shouldAttachBudget = classification.isPointChart &&
    pointBudget.maxPoints !== Infinity &&
    Number.isFinite(pointBudget.maxPoints);

  const shouldAttachLineBudget = classification.isLineChart &&
    !classification.isScatter &&
    pointBudget.lineBudgetMaxRows != null &&
    Number.isFinite(pointBudget.lineBudgetMaxRows);

  const queryDescExec: QueryDescription = shouldAttachBudget
    ? ({
        ...queryDesc,
        result_budget: {
          max_rows: pointBudget.maxPoints,
          strategy: pointBudget.strategy,
          stratify_field: pointBudget.stratifyField,
          min_per_stratum: pointBudget.minPerStratum,
          preserve_fields: pointBudget.preserveFields,
        },
      } as QueryDescription)
    : shouldAttachLineBudget
      ? ({
          ...queryDesc,
          result_budget: {
            max_rows: pointBudget.lineBudgetMaxRows!,
            strategy: (pointBudget.continuousFields?.length ?? 0) > 0 ? 'preserve_extremes' : 'random',
            preserve_fields: pointBudget.continuousFields?.length ? pointBudget.continuousFields : undefined,
          },
        } as QueryDescription)
      : queryDesc;

  const samplingBudget: SamplingBudget = {
    maxPoints: pointBudget.maxPoints,
    shouldAttachBudget,
    lineBudgetMaxRows: pointBudget.lineBudgetMaxRows,
  };

  return {
    classification,
    pointBudget,
    queryDescExec,
    samplingBudget,
    shouldAttachBudget,
  };
}

export function getRequiredColumns(queryDesc: QueryDescription): string[] {
  return [
    ...(queryDesc.dimensions?.map((dimension) => dimension.field) || []),
    ...(queryDesc.measures?.map((measure) => measure.field) || []),
  ];
}

export function queryRequiresAggregation(queryDesc: QueryDescription): boolean {
  return (
    (queryDesc.measures?.length ?? 0) > 0 &&
    queryDesc.measures!.some((measure) => measure.aggregation)
  );
}

export function getQueryDimensions(queryDesc: QueryDescription): string[] {
  return queryDesc.dimensions?.map((dimension) => dimension.field) || [];
}

export function buildFieldsForResultRemapping(args: {
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField: Field | null;
}): Field[] {
  return [
    ...args.xAxisFields,
    ...args.yAxisFields,
    ...(args.colorField ? [args.colorField] : []),
    ...(args.sizeField ? [args.sizeField] : []),
  ];
}

export function postProcessQueryResult(args: {
  result: QueryResult;
  fieldsForRemapping: Field[];
  samplingBudget: SamplingBudget | null;
}): QueryResult {
  const { result, fieldsForRemapping, samplingBudget } = args;
  const remappedResult = remapCastExpressionColumns(result, fieldsForRemapping);
  const cleanedResult = validateAndCleanData(remappedResult);

  if (samplingBudget) {
    const { maxPoints, shouldAttachBudget, lineBudgetMaxRows } = samplingBudget;
    if (shouldAttachBudget && Number.isFinite(maxPoints) && result.row_count >= maxPoints) {
      cleanedResult.sampled = { limit: maxPoints, type: 'point' };
    } else if (lineBudgetMaxRows && Number.isFinite(lineBudgetMaxRows) && result.row_count >= lineBudgetMaxRows) {
      cleanedResult.sampled = { limit: lineBudgetMaxRows, type: 'line' };
    }
  }

  return cleanedResult;
}
