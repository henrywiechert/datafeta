import { ChartStrategy, ChartContext, VegaLiteSpec, FacetConfig, ChartType } from '../types';
import { FacetingManager } from '../facetingManager';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Base implementation for chart strategies.
 * Provides common functionality and structure for all chart types.
 */
export abstract class BaseChart implements ChartStrategy {
  abstract readonly type: ChartType;

  abstract canHandle(context: ChartContext): boolean;
  
  /**
   * Main method to generate a complete Vega-Lite spec.
   * Template method that orchestrates the spec generation process.
   */
  generateSpec(context: ChartContext): VegaLiteSpec {
    const baseSpec = this.createBaseSpec();
    const facetConfig = FacetingManager.getFacetConfig(context.hasFaceting);
    
    // Apply sizing configuration
    this.applySizing(baseSpec, facetConfig);
    
    // Generate chart-specific mark and encodings
    this.applyMark(baseSpec, context);
    this.applyEncodings(baseSpec, context);
    
    // Apply faceting if needed
    if (context.hasFaceting) {
      this.applyFaceting(baseSpec, context);
    }
    
    return baseSpec;
  }

  /**
   * Creates the base Vega-Lite specification with common properties.
   */
  protected createBaseSpec(): VegaLiteSpec {
    return {
      "description": "A chart created by DataFeta.",
      "data": { "name": "table" },
      "encoding": {},
      "config": {
        "view": {
          "stroke": "transparent"
        },
        "facet": {
          "spacing": 10
        }
      }
    };
  }

  /**
   * Applies sizing configuration based on faceting.
   */
  protected applySizing(spec: VegaLiteSpec, facetConfig: FacetConfig): void {
    spec.width = facetConfig.width;
    spec.height = facetConfig.height;
    
    if (facetConfig.resolve) {
      spec.resolve = facetConfig.resolve;
    }
  }

  /**
   * Applies faceting encodings to the spec.
   */
  protected applyFaceting(spec: VegaLiteSpec, context: ChartContext): void {
    const queryType = context.queryType;
    FacetingManager.applyFacetEncodings(spec, context, queryType);
  }

  /**
   * Helper method to get field result column name.
   * This method uses the query type from context instead of hard-coding it.
   */
  protected getFieldName(field: any, context: ChartContext): string {
    const queryType = context.queryType;
    
    if (queryType === 'raw') {
      // For raw queries, always use the raw column name
      return field.columnName;
    } else {
      // For aggregated queries, use the aggregated name
      return getResultColumnName(field);
    }
  }

  /**
   * Creates an ordinal scale configuration with padding.
   */
  protected createOrdinalScale(paddingInner = 0.3, paddingOuter = 0.2) {
    return {
      "paddingInner": paddingInner,
      "paddingOuter": paddingOuter
    };
  }

  // Abstract methods that subclasses must implement
  protected abstract applyMark(spec: VegaLiteSpec, context: ChartContext): void;
  protected abstract applyEncodings(spec: VegaLiteSpec, context: ChartContext): void;
} 