import { FieldClassification, FacetConfig, ChartContext } from './types';
import { getResultColumnName } from '../utils/fieldUtils';

/**
 * Manages faceting logic for creating multiple chart grids.
 * This centralizes the complex faceting detection that was scattered across chart types.
 */
export class FacetingManager {
  /**
   * Determines if faceting should be applied based on field configuration.
   * Faceting occurs when we have multiple dimensions that would create a grid of sub-charts.
   */
  static shouldFacet(classification: FieldClassification): boolean {
    const { xDimensions, yDimensions } = classification;
    
    // Faceting is enabled in two main scenarios:
    // 1. Multiple discrete dimensions on a single axis (hierarchical faceting)
    const hasHierarchicalFaceting = xDimensions.length > 1 || yDimensions.length > 1;

    // 2. Discrete dimensions on both X and Y axes (grid faceting)
    const hasGridFaceting = xDimensions.length > 0 && yDimensions.length > 0;

    return hasHierarchicalFaceting || hasGridFaceting;
  }

  /**
   * Generates faceting configuration for Vega-Lite specs.
   */
  static getFacetConfig(hasFaceting: boolean): FacetConfig {
    if (!hasFaceting) {
      return {
        enabled: false,
        width: "container",
        height: "container"
      };
    }

    return {
      enabled: true,
      width: 200,  // Smaller individual chart sizes for scrolling
      height: 150,
      resolve: {
        scale: {
          x: "shared",  // Shared scales for consistent comparison across facets
          y: "shared"   // Shared scales for consistent comparison across facets
        }
      }
    };
  }

  /**
   * Applies faceting encodings to a Vega-Lite spec based on field configuration.
   */
  static applyFacetEncodings(spec: any, context: ChartContext, queryType: 'raw' | 'aggregated'): void {
    const { classification } = context;
    const { xDimensions, yDimensions } = classification;

    let hasRowFaceting = false;
    let hasColumnFaceting = false;

    // Apply column faceting for hierarchical dimensions (e.g., if there are more than one X dimension)
    if (xDimensions.length > 1) {
      spec.encoding.column = {
        field: this.getFieldName(xDimensions[1], queryType),
        type: "ordinal"
      };
      hasColumnFaceting = true;
    }

    // Apply row faceting for hierarchical dimensions (e.g., if there are more than one Y dimension)
    if (yDimensions.length > 1) {
      spec.encoding.row = {
        field: this.getFieldName(yDimensions[1], queryType),
        type: "ordinal"
      };
      hasRowFaceting = true;
    }

    // Configure axes for cleaner faceted charts
    this.configureFacetedAxes(spec, hasRowFaceting, hasColumnFaceting);
  }

  /**
   * Configures axes for faceted charts to reduce visual clutter.
   * With shared scales, we only need axes on the outer edges.
   */
  private static configureFacetedAxes(spec: any, hasRowFaceting: boolean, hasColumnFaceting: boolean): void {
    // For now, let's just rely on Vega-Lite's default behavior with shared scales
    // The shared scales should already provide the cleaner look we want
    
    // TODO: Research the correct Vega-Lite approach for conditional axis labels
    // The facetIndex/facetCount functions don't exist in Vega-Lite
  }

  /**
   * Helper to get field name using context-aware field name resolution.
   */
  private static getFieldName(field: any, queryType: 'raw' | 'aggregated'): string {
    if (queryType === 'raw') {
      // For raw queries, always use the raw column name
      return field.columnName;
    } else {
      // For aggregated queries, use the aggregated name
      return getResultColumnName(field);
    }
  }
} 