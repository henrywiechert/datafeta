import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Unified faceting utilities that implement the consistent pattern:
 * - X-axis content → horizontal faceting (fx) 
 * - Y-axis content → vertical faceting (fy)
 * 
 * This applies to both:
 * - Multiple measures on same axis
 * - Discrete dimensions + measures on same axis
 */

export interface FacetConfiguration {
  fx?: string;
  fy?: string;
  fxField?: Field;
  fyField?: Field;
}

/**
 * Creates facet configuration based on the consistent axis-to-direction pattern.
 * 
 * @param xFields - Fields on X-axis that should create horizontal facets
 * @param yFields - Fields on Y-axis that should create vertical facets
 * @param facetingReason - For debugging: 'measures' | 'dimensions' | 'mixed'
 */
export function createFacetConfiguration(
  xFields: Field[], 
  yFields: Field[], 
  facetingReason: string = 'fields'
): FacetConfiguration {
  const config: FacetConfiguration = {};

  // X-axis content → horizontal faceting (fx)
  if (xFields.length > 0) {
    if (facetingReason === 'measures' && xFields.length > 1) {
      // For multiple measures, use a synthetic field name
      config.fx = '_x_measure_name';
      config.fxField = createMeasureFacetField(xFields, 'x');
      console.log(`🔄 Creating horizontal facets (fx) for ${xFields.length} X-axis measures`);
    } else {
      // For dimensions or single fields, use the actual field name
      const facetField = xFields[0];
      config.fx = getResultColumnName(facetField);
      config.fxField = facetField;
      console.log(`🔄 Creating horizontal facets (fx) from X-axis ${facetingReason}: ${config.fx}`);
    }
  }

  // Y-axis content → vertical faceting (fy)  
  if (yFields.length > 0) {
    if (facetingReason === 'measures' && yFields.length > 1) {
      // For multiple measures, use a synthetic field name
      config.fy = '_y_measure_name';
      config.fyField = createMeasureFacetField(yFields, 'y');
      console.log(`🔄 Creating vertical facets (fy) for ${yFields.length} Y-axis measures`);
    } else {
      // For dimensions or single fields, use the actual field name
      const facetField = yFields[0];
      config.fy = getResultColumnName(facetField);
      config.fyField = facetField;
      console.log(`🔄 Creating vertical facets (fy) from Y-axis ${facetingReason}: ${config.fy}`);
    }
  }

  return config;
}

/**
 * Creates a synthetic faceting field for multiple measures on the same axis.
 * This allows us to use Observable Plot's native faceting for measure separation.
 */
export function createMeasureFacetField(measures: Field[], axis: 'x' | 'y'): Field {
  const measureNames = measures.map(m => m.columnName).join('_');
  return {
    id: `${axis}_measure_facet_${measureNames}`,
    columnName: `${axis}_measure_facet`,
    type: 'dimension',
    dataType: 'string',
    // Add the measures as metadata for processing
    _measureFields: measures,
    _facetAxis: axis
  } as Field & { _measureFields: Field[], _facetAxis: 'x' | 'y' };
}

/**
 * Applies facet configuration to Plot options.
 * Handles both regular field faceting and synthetic measure faceting.
 */
export function applyFacetConfiguration(
  plotOptions: Plot.PlotOptions, 
  facetConfig: FacetConfiguration
): Plot.PlotOptions {
  const updatedOptions = { ...plotOptions };

  if (facetConfig.fx) {
    updatedOptions.fx = { 
      label: facetConfig.fxField?.columnName || facetConfig.fx,
      // Ensure proper spacing for horizontal facets
      padding: 0.1
    };
  }

  if (facetConfig.fy) {
    updatedOptions.fy = { 
      label: facetConfig.fyField?.columnName || facetConfig.fy,
      // Ensure proper spacing for vertical facets
      padding: 0.1
    };
  }

  return updatedOptions;
}

/**
 * Enhances mark configuration with faceting properties.
 * This adds fx/fy properties to the actual plot marks.
 */
export function addFacetingToMark(markConfig: any, facetConfig: FacetConfiguration): any {
  const enhancedConfig = { ...markConfig };

  if (facetConfig.fx) {
    enhancedConfig.fx = facetConfig.fx;
  }

  if (facetConfig.fy) {
    enhancedConfig.fy = facetConfig.fy;
  }

  return enhancedConfig;
}