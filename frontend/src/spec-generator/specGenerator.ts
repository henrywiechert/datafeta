// Backward compatibility exports
// This file now delegates to the new modular spec generator

export type { VegaLiteSpec } from './types';
export { generateVegaLiteSpec, getChartInfo } from './specGeneratorV2';

// Legacy export for existing imports
export type { VegaLiteSpec as default } from './types'; 