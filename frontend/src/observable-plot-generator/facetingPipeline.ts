import * as Plot from '@observablehq/plot';
import { Field, QueryResult } from '../types';

/**
 * Multi-layered faceting pipeline for Observable Plot
 * 
 * Architecture:
 * Layer 1: Single Chart Generation - selects fields for base chart
 * Layer 2: Multi-Measure Faceting - creates multiple charts for multiple measures  
 * Layer 3: Discrete Dimension Faceting - applies fx/fy faceting for remaining dimensions
 */

export interface FacetingContext {
  remainingXFields: Field[];
  remainingYFields: Field[];
  queryResult: QueryResult;
  consumedFields: {
    xFields: Field[];
    yFields: Field[];
  };
}

export interface ChartSpec {
  plotOptions: Plot.PlotOptions;
  usedFields: {
    xFields: Field[];
    yFields: Field[];
  };
}

export interface FacetedResult {
  charts: ChartSpec[];
  finalContext: FacetingContext;
}

export interface FacetingLayer {
  name: string;
  canApply(context: FacetingContext): boolean;
  apply(context: FacetingContext): FacetedResult;
}

/**
 * Main orchestrator for the faceting pipeline
 */
export class FacetingPipeline {
  private layers: FacetingLayer[] = [];

  constructor(layers: FacetingLayer[]) {
    this.layers = layers;
  }

  /**
   * Process fields through all faceting layers
   */
  process(xFields: Field[], yFields: Field[], queryResult: QueryResult): FacetedResult {
    let context: FacetingContext = {
      remainingXFields: [...xFields],
      remainingYFields: [...yFields],
      queryResult,
      consumedFields: {
        xFields: [],
        yFields: []
      }
    };

    let charts: ChartSpec[] = [];

    // Process through each layer
    for (const layer of this.layers) {
      if (layer.canApply(context)) {
        console.log(`🔄 Applying faceting layer: ${layer.name}`);
        const result = layer.apply(context);
        charts = result.charts;
        context = result.finalContext;
      } else {
        console.log(`⏭️ Skipping faceting layer: ${layer.name} (not applicable)`);
      }
    }

    return {
      charts,
      finalContext: context
    };
  }

  /**
   * Helper to consume fields from context
   */
  static consumeFields(
    context: FacetingContext, 
    xFieldsToConsume: Field[], 
    yFieldsToConsume: Field[]
  ): FacetingContext {
    return {
      remainingXFields: context.remainingXFields.filter(f => 
        !xFieldsToConsume.some(consumed => consumed.id === f.id)
      ),
      remainingYFields: context.remainingYFields.filter(f => 
        !yFieldsToConsume.some(consumed => consumed.id === f.id)
      ),
      queryResult: context.queryResult,
      consumedFields: {
        xFields: [...context.consumedFields.xFields, ...xFieldsToConsume],
        yFields: [...context.consumedFields.yFields, ...yFieldsToConsume]
      }
    };
  }
}