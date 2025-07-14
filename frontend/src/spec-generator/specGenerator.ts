// Backward compatibility exports
// This file now delegates to the new modular spec generator

// Export types
export type { VegaLiteSpec, ChartGenerationResult } from './types';

// Export functions with properly defined types
export { generateVegaLiteSpec, getChartInfo } from './specGeneratorV2';

// Legacy export for existing imports
export type { VegaLiteSpec as default } from './types'; 