import { Field } from '../types';
import { VegaLiteSpec, ChartContext, ChartStrategy } from './types';
import { FieldClassifier } from './fieldClassifier';
import { FacetingManager } from './facetingManager';
import { getQueryTypeFromFields } from '../queryBuilder/queryBuilder';

// Import chart strategies
import { BarChart } from './chartTypes/barChart';
import { ScatterChart } from './chartTypes/scatterChart';
import { LineChart } from './chartTypes/lineChart';
import { TickStripChart } from './chartTypes/tickStripChart';

interface SpecGeneratorArgs {
  xFields: Field[];
  yFields: Field[];
}

/**
 * Modular spec generator that uses strategy pattern for different chart types.
 * This replaces the monolithic generateVegaLiteSpec function with a clean, extensible architecture.
 */
export class SpecGenerator {
  private strategies: ChartStrategy[];

  constructor() {
    // Register all available chart strategies
    // Order matters - priority: TickStrip → Bar → Line → Scatter → Pie
    this.strategies = [
      new TickStripChart(),     // Priority 1: continuous dimension only (no measures)
      new BarChart(),           // Priority 2: discrete dimension + measure
      new LineChart(),          // Priority 3: continuous dimension + measure
      new ScatterChart(),       // Priority 4: continuous dimension + continuous dimension
    ];
  }

  /**
   * Main entry point for generating Vega-Lite specifications.
   * Orchestrates field analysis, chart type selection, and spec generation.
   */
  generateSpec(args: SpecGeneratorArgs): VegaLiteSpec {
    const { xFields, yFields } = args;

    // Step 1: Classify fields
    const classification = FieldClassifier.classifyFields(xFields, yFields);

    // Step 2: Determine faceting
    const hasFaceting = FacetingManager.shouldFacet(classification);

    // Step 3: Determine query type from field configuration
    const allFields = [...xFields, ...yFields];
    const queryType = getQueryTypeFromFields(allFields);

    // Step 4: Create chart context
    const context: ChartContext = {
      xFields,
      yFields,
      classification,
      hasFaceting,
      queryType
    };

    // Step 5: Find appropriate chart strategy
    const strategy = this.findStrategy(context);

    // Step 6: Generate spec using selected strategy
    if (strategy) {
      return strategy.generateSpec(context);
    }

    // Fallback if no strategy matches
    return this.createFallbackSpec();
  }

  /**
   * Finds the first strategy that can handle the given context.
   */
  private findStrategy(context: ChartContext): ChartStrategy | null {
    return this.strategies.find(strategy => strategy.canHandle(context)) || null;
  }

  /**
   * Creates a fallback specification when no chart type matches.
   */
  private createFallbackSpec(): VegaLiteSpec {
    return {
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "Drag fields to the axes to create a chart.",
    };
  }

  /**
   * Registers a new chart strategy.
   * Allows external code to add custom chart types.
   */
  registerStrategy(strategy: ChartStrategy): void {
    this.strategies.unshift(strategy); // Add to beginning for priority
  }

  /**
   * Gets information about the selected chart type for debugging.
   */
  getChartInfo(args: SpecGeneratorArgs) {
    const { xFields, yFields } = args;
    const classification = FieldClassifier.classifyFields(xFields, yFields);
    const hasFaceting = FacetingManager.shouldFacet(classification);
    const allFields = [...xFields, ...yFields];
    const queryType = getQueryTypeFromFields(allFields);
    
    const context: ChartContext = {
      xFields,
      yFields,
      classification,
      hasFaceting,
      queryType
    };

    const strategy = this.findStrategy(context);
    
    return {
      chartType: strategy?.type || 'unknown',
      queryType: queryType,
      hasFaceting,
      fieldCounts: {
        xFields: xFields.length,
        yFields: yFields.length,
        xMeasures: classification.xMeasures.length,
        yMeasures: classification.yMeasures.length,
        xDimensions: classification.xDimensions.length,
        yDimensions: classification.yDimensions.length
      }
    };
  }
}

// Create singleton instance
const specGenerator = new SpecGenerator();

/**
 * Main function that maintains compatibility with existing code.
 * This is a drop-in replacement for the old generateVegaLiteSpec function.
 */
export function generateVegaLiteSpec(args: SpecGeneratorArgs): VegaLiteSpec {
  return specGenerator.generateSpec(args);
}

/**
 * Helper function for debugging chart selection.
 */
export function getChartInfo(args: SpecGeneratorArgs) {
  return specGenerator.getChartInfo(args);
} 