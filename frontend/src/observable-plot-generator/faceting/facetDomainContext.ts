// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { ChartGenerationContext } from '../types';
import { getFieldColumnName } from '../helpers/fields';
import { computeSharedDomainsForFaceting, SharedDomains } from './facetDomains';
import type { FacetDataIndex } from './facetDataIndex';
import type { FacetSpace } from './facetSpace';
import type { FacetCoordinatorConfig } from './facetTypes';

export interface FacetDomainContext {
  sharedDomains: SharedDomains;
  effectiveSharedDomains: SharedDomains;
  perColumnSharedDomains: SharedDomains[] | null;
  perRowSharedDomains: SharedDomains[] | null;
}

export function buildFacetDomainContext(
  config: FacetCoordinatorConfig,
  facetSpace: FacetSpace,
  dataIndex: FacetDataIndex
): FacetDomainContext {
  const { context, plan, categoryField, sharedCategoryDomain } = config;
  const { xFields, yFields, queryResult, colorField, independentDomains } = context;
  const { rowFacetFields, colFacetFields } = plan;
  const allFacetFields = [...rowFacetFields, ...colFacetFields];

  const sharedDomains = computeSharedDomainsForFaceting(
    queryResult.rows,
    xFields,
    yFields,
    colorField,
    categoryField || undefined,
    allFacetFields,
    context.colorScheme,
    context.colorBias,
    context.measureValuesSourceFields,
    context.fieldOverrides
  );

  const perColumnSharedDomains = independentDomains?.x
    ? facetSpace.safeColCombos.map((colCombo) => {
        const colRows = dataIndex.getColumnRows(colCombo);
        const columnDomains = colRows.length > 0
          ? computeSharedDomainsForFaceting(
              colRows,
              xFields,
              yFields,
              colorField,
              categoryField || undefined,
              allFacetFields,
              context.colorScheme,
              context.colorBias,
              context.measureValuesSourceFields,
              context.fieldOverrides
            )
          : sharedDomains;

        return withGlobalColorScale(
          withCategoryDomainOverride(columnDomains, categoryField, sharedCategoryDomain),
          sharedDomains
        );
      })
    : null;

  const perRowSharedDomains = independentDomains?.y
    ? facetSpace.safeRowCombos.map((rowCombo) => {
        const rowRows = dataIndex.getRowRows(rowCombo);
        const rowDomains = rowRows.length > 0
          ? computeSharedDomainsForFaceting(
              rowRows,
              xFields,
              yFields,
              colorField,
              categoryField || undefined,
              allFacetFields,
              context.colorScheme,
              context.colorBias,
              context.measureValuesSourceFields,
              context.fieldOverrides
            )
          : sharedDomains;

        return withGlobalColorScale(
          withCategoryDomainOverride(rowDomains, categoryField, sharedCategoryDomain),
          sharedDomains
        );
      })
    : null;

  const effectiveSharedDomains = independentDomains?.x || independentDomains?.y
    ? filterSharedDomainsForIndependentAxes(sharedDomains, xFields, yFields, independentDomains)
    : cloneSharedDomains(sharedDomains);

  return {
    sharedDomains,
    effectiveSharedDomains: withCategoryDomainOverride(
      effectiveSharedDomains,
      categoryField,
      sharedCategoryDomain
    ),
    perColumnSharedDomains,
    perRowSharedDomains,
  };
}

export function buildSampleDomains(
  context: ChartGenerationContext,
  domainContext: FacetDomainContext
): SharedDomains {
  let sampleDomains = cloneSharedDomains(domainContext.effectiveSharedDomains);

  if (domainContext.perColumnSharedDomains?.[0]) {
    sampleDomains = overlayDomains(sampleDomains, domainContext.perColumnSharedDomains[0]);
  }
  if (domainContext.perRowSharedDomains?.[0]) {
    sampleDomains = overlayAxisDomains(sampleDomains, domainContext.perRowSharedDomains[0], getDomainKeys(context.yFields), 'measure');
  }

  return withGlobalColorScale(sampleDomains, domainContext.sharedDomains);
}

export function buildCellDomains(
  context: ChartGenerationContext,
  domainContext: FacetDomainContext,
  rowIndex: number,
  colIndex: number
): SharedDomains {
  const { independentDomains, yFields } = context;
  const yKeys = getDomainKeys(yFields);
  let cellDomains = cloneSharedDomains(domainContext.effectiveSharedDomains);

  if (domainContext.perColumnSharedDomains?.[colIndex]) {
    cellDomains = overlayDomains(cellDomains, domainContext.perColumnSharedDomains[colIndex]);

    if (!independentDomains?.y) {
      cellDomains = overlayAxisDomains(cellDomains, domainContext.effectiveSharedDomains, yKeys, 'both');
    }
  }

  if (domainContext.perRowSharedDomains?.[rowIndex]) {
    cellDomains = overlayAxisDomains(cellDomains, domainContext.perRowSharedDomains[rowIndex], yKeys, 'both');
  }

  return withGlobalColorScale(cellDomains, domainContext.sharedDomains);
}

function getDomainKeys(fields: Field[]): Set<string> {
  return new Set(fields.map((f) => getFieldColumnName(f)));
}

function cloneSharedDomains(domains: SharedDomains): SharedDomains {
  return {
    ...domains,
    measure: { ...(domains.measure || {}) },
    numeric: { ...(domains.numeric || {}) },
    categorical: { ...(domains.categorical || {}) },
    colorScale: domains.colorScale,
  };
}

function overlayDomains(base: SharedDomains, overlay: SharedDomains): SharedDomains {
  return {
    ...base,
    measure: { ...(base.measure || {}), ...(overlay.measure || {}) },
    numeric: { ...(base.numeric || {}), ...(overlay.numeric || {}) },
    categorical: { ...(base.categorical || {}), ...(overlay.categorical || {}) },
    colorScale: overlay.colorScale,
  };
}

function overlayAxisDomains(
  base: SharedDomains,
  overlay: SharedDomains,
  keys: Set<string>,
  domainTypes: 'measure' | 'both'
): SharedDomains {
  const next = cloneSharedDomains(base);
  for (const key of Object.keys(overlay.measure || {})) {
    if (keys.has(key)) {
      next.measure[key] = overlay.measure[key];
    }
  }

  if (domainTypes === 'both') {
    for (const key of Object.keys(overlay.numeric || {})) {
      if (keys.has(key)) {
        next.numeric[key] = overlay.numeric[key];
      }
    }
  }

  return next;
}

function withCategoryDomainOverride(
  domains: SharedDomains,
  categoryField?: Field | null,
  sharedCategoryDomain?: any[]
): SharedDomains {
  if (!categoryField || !sharedCategoryDomain) {
    return cloneSharedDomains(domains);
  }

  return {
    ...cloneSharedDomains(domains),
    categorical: {
      ...(domains.categorical || {}),
      [getFieldColumnName(categoryField)]: sharedCategoryDomain,
    },
  };
}

function withGlobalColorScale(domains: SharedDomains, globalDomains: SharedDomains): SharedDomains {
  return {
    ...cloneSharedDomains(domains),
    colorScale: globalDomains.colorScale,
  };
}

function filterSharedDomainsForIndependentAxes(
  shared: SharedDomains,
  xFields: Field[],
  yFields: Field[],
  independentDomains?: { x?: boolean; y?: boolean }
): SharedDomains {
  const xLabels = independentDomains?.x
    ? xFields.map((f) => getFieldColumnName(f))
    : [];
  const yLabels = independentDomains?.y
    ? yFields.map((f) => getFieldColumnName(f))
    : [];

  const labelsToFilter = new Set([...xLabels, ...yLabels]);
  if (labelsToFilter.size === 0) return shared;

  const filteredMeasure = Object.fromEntries(
    Object.entries(shared.measure || {}).filter(([key]) => !labelsToFilter.has(key))
  ) as Record<string, [number, number]>;

  const filteredNumeric = Object.fromEntries(
    Object.entries(shared.numeric || {}).filter(([key]) => !labelsToFilter.has(key))
  ) as Record<string, [number, number] | [Date, Date]>;

  return {
    ...shared,
    measure: filteredMeasure,
    numeric: filteredNumeric,
    colorScale: shared.colorScale,
  };
}
