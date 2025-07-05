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
    const { xDimensions, yDimensions, xContinuous, yContinuous } = classification;
    
    return (
      // Multiple dimensions on X-axis → Creates column facets
      xDimensions.length > 1 ||
      // Multiple dimensions on Y-axis → Creates row facets
      yDimensions.length > 1 ||
      // Dimensions on both axes with continuous measures → Creates grid for scatter/line charts
      (xDimensions.length > 0 && yDimensions.length > 0 && (xContinuous.length > 0 || yContinuous.length > 0))
    );
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
          x: "independent",
          y: "independent"
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

    // Apply column faceting (multiple X dimensions)
    if (xDimensions.length > 1) {
      spec.encoding.column = {
        field: this.getFieldName(xDimensions[1], queryType),
        type: "ordinal"
      };
    }

    // Apply row faceting (multiple Y dimensions)
    if (yDimensions.length > 1) {
      spec.encoding.row = {
        field: this.getFieldName(yDimensions[1], queryType),
        type: "ordinal"
      };
    }

    // Special case: dimensions on both axes (for scatter/line charts)
    if (xDimensions.length > 0 && yDimensions.length > 0) {
      const { xContinuous, yContinuous } = classification;
      
      if (xContinuous.length > 0 || yContinuous.length > 0) {
        // For scatter/line charts with both dimensions and continuous data
        if (yDimensions.length > 0 && !spec.encoding.row) {
          spec.encoding.row = {
            field: this.getFieldName(yDimensions[0], queryType),
            type: "ordinal"
          };
        }
        
        if (xDimensions.length > 0 && !spec.encoding.column) {
          spec.encoding.column = {
            field: this.getFieldName(xDimensions[0], queryType),
            type: "ordinal"
          };
        }
      }
    }
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