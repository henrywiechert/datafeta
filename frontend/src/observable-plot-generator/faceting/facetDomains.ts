import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { computeSharedMeasureDomains } from '../domains/measureDomains';
import { computeSharedNumericDomains, computeSharedCategoricalDomains } from '../domains/numericDomains';
import { ColorScaleInfo, deriveColorScaleInfo } from '../utils/colorSchemeUtils';

/**
 * Consolidated domain information for faceted charts
 */
export interface SharedDomains {
  measure: Record<string, [number, number]>;
  numeric: Record<string, [number, number]>;
  categorical: Record<string, any[]>;
  colorScale?: ColorScaleInfo | null;
}

/**
 * Compute all shared domains needed for faceting.
 * This centralizes domain computation logic that was duplicated across facetGenerator and coreGridGenerator.
 */
export function computeSharedDomainsForFaceting(
  data: any[],
  xFields: Field[],
  yFields: Field[],
  colorField?: Field,
  categoryField?: Field,
  facetFields?: Field[],
  colorSchemeId?: string
): SharedDomains {
  // Compute shared measure domains
  const allMeasures = [...xFields, ...yFields].filter((f: any) => f.type === 'measure' && f.flavour === 'continuous');
  const measureDomains = computeSharedMeasureDomains(
    data, 
    allMeasures as any[], 
    allMeasures as any[],
    colorField,
    categoryField,
    facetFields
  );

  // Compute shared numeric domains (for continuous dimensions and measures)
  const numericDomains = computeSharedNumericDomains(data, xFields as any[], yFields as any[]);

  // Compute categorical domains
  const categoricalDomains = categoryField 
    ? computeSharedCategoricalDomains(data, [categoryField])
    : {};

  // Compute shared color domain
  const colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorSchemeId) : null;

  return {
    measure: measureDomains as Record<string, [number, number]>,
    numeric: numericDomains,
    categorical: categoricalDomains,
    colorScale,
  };
}

/**
 * Apply shared domains to plot options.
 * This centralizes the domain application logic that was scattered across facetGenerator.
 */
export function applySharedDomains(
  plotOptions: Plot.PlotOptions,
  sharedDomains: SharedDomains
): Plot.PlotOptions {
  const opts = { ...plotOptions };
  
  // Get domain keys from axis configurations
  const xDomainKey = (opts as any)?.x?.domainKey || (opts as any)?.x?.domainLabel || (opts as any)?.x?.label;
  const yDomainKey = (opts as any)?.y?.domainKey || (opts as any)?.y?.domainLabel || (opts as any)?.y?.label;
  
  // Apply numeric/measure domains to axes
  const xDomain = (sharedDomains.numeric && xDomainKey && sharedDomains.numeric[xDomainKey]) 
    || (sharedDomains.measure && xDomainKey && sharedDomains.measure[xDomainKey]);
  const yDomain = (sharedDomains.numeric && yDomainKey && sharedDomains.numeric[yDomainKey]) 
    || (sharedDomains.measure && yDomainKey && sharedDomains.measure[yDomainKey]);
  
  if (xDomain && opts.x) {
    opts.x = { ...(opts.x as any), domain: xDomain } as any;
  }
  if (yDomain && opts.y) {
    opts.y = { ...(opts.y as any), domain: yDomain } as any;
  }
  
  // Apply shared color domain
  if (sharedDomains.colorScale) {
    const scale = sharedDomains.colorScale;
    const colorConfig = scale.kind === 'continuous'
      ? {
          type: 'linear',
          domain: scale.domain as [number, number],
          range: scale.range,
          clamp: true,
        }
      : {
          type: 'ordinal' as any,
          domain: scale.domain as any[],
          range: scale.range,
        };
    opts.color = {
      ...(opts as any).color,
      ...colorConfig,
    } as any;
  }
  
  // Apply categorical domain to band scales
  for (const [columnName, domain] of Object.entries(sharedDomains.categorical)) {
    if ((opts as any)?.x?.type === 'band' && (opts as any)?.x?.label === columnName) {
      opts.x = { ...(opts.x as any), domain: domain as any } as any;
    }
    if ((opts as any)?.y?.type === 'band' && (opts as any)?.y?.label === columnName) {
      opts.y = { ...(opts.y as any), domain: domain as any } as any;
    }
  }
  
  return opts;
}

/**
 * Apply intrinsic size adjustments based on categorical domain.
 * This keeps bar thickness consistent across facets.
 */
export function applyIntrinsicSizeFromCategoryDomain(
  plotOptions: Plot.PlotOptions,
  categoryAxis: 'x' | 'y' | null,
  categoryDomain: any[] | undefined,
  barStepPx: number
): Plot.PlotOptions {
  if (!categoryAxis || !categoryDomain || categoryDomain.length === 0) {
    return plotOptions;
  }
  
  const opts = { ...plotOptions };
  const count = categoryDomain.length;
  const minSize = Math.max(barStepPx * 2, count * barStepPx);
  
  if (categoryAxis === 'y' && (opts as any)?.y?.type === 'band') {
    (opts as any).height = minSize;
  }
  if (categoryAxis === 'x' && (opts as any)?.x?.type === 'band') {
    (opts as any).width = minSize;
  }
  
  return opts;
}
