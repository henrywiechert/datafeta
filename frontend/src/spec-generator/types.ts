import { Field } from '../types';

// Define VegaLiteSpec with minimal required properties
export interface VegaLiteSpec {
  $schema?: string;
  description?: string;
  [key: string]: any;
}

// Define return type for generateVegaLiteSpec
export interface ChartGenerationResult {
  spec: VegaLiteSpec;
  chartInfo: any;
}

// Core field analysis types
export interface FieldClassification {
  // Legacy axis-specific fields (for backwards compatibility)
  xContinuous: Field[];
  yContinuous: Field[];
  xDiscrete: Field[];
  yDiscrete: Field[];
  xMeasures: Field[];
  yMeasures: Field[];
  xDimensions: Field[];
  yDimensions: Field[];
  
  // Unified semantic + data type classification
  continuousMeasures: Field[];     // Continuous + Aggregated
  discreteMeasures: Field[];       // Discrete + Aggregated  
  continuousDimensions: Field[];   // Continuous + Grouping
  discreteDimensions: Field[];     // Discrete + Grouping
  
  // New unified flavour-based classification
  continuousFields: Field[];
  discreteFields: Field[];

  // Helper methods
  hasMeasures(): boolean;
  hasDimensions(): boolean;
  hasDiscreteDimensions(): boolean;
  hasContinuousDimensions(): boolean;
  hasContinuousData(): boolean;
}

// Chart generation context
export interface ChartContext {
  xFields: Field[];
  yFields: Field[];
  classification: FieldClassification;
  hasFaceting: boolean;
  queryType: 'raw' | 'aggregated';
}

// Faceting configuration
export interface FacetConfig {
  enabled: boolean;
  width?: number | string;
  height?: number | string;
  resolve?: {
    scale?: {
      x?: string;
      y?: string;
    };
  };
}

// Chart type identification
export type ChartType = 'line' | 'scatter' | 'bar' | 'bar-vertical' | 'bar-horizontal' | 'tick' | 'unknown';

// Base chart interface
export interface ChartStrategy {
  readonly type: ChartType;
  canHandle(context: ChartContext): boolean;
  generateSpec(context: ChartContext): VegaLiteSpec;
}

// Configuration for chart generation
export interface ChartConfig {
  barWidth?: number;
  barHeight?: number;
  barPaddingInner?: number;
  barPaddingOuter?: number;
  pointSize?: number;
  lineStrokeWidth?: number;
} 