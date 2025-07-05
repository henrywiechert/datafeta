// Main exports for the modular spec generator
export { generateVegaLiteSpec, getChartInfo, SpecGenerator } from './specGeneratorV2';
export type { VegaLiteSpec, ChartType, ChartStrategy, ChartContext, FieldClassification } from './types';

// Utility exports
export { FieldClassifier } from './fieldClassifier';
export { FacetingManager } from './facetingManager';

// Chart strategy exports for extensibility
export { BaseChart } from './chartTypes/baseChart';
export { BarChart } from './chartTypes/barChart';
export { ScatterChart } from './chartTypes/scatterChart';
export { LineChart } from './chartTypes/lineChart'; 