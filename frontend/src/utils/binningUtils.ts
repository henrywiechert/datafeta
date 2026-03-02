/**
 * Binning utilities for creating histogram-style binned fields.
 * 
 * Binned fields are virtual columns that group continuous values into discrete bins,
 * enabling histogram visualizations when combined with COUNT aggregation.
 */

import { BinnedFieldDefinition, VirtualColumnDefinition } from '../types';

/**
 * Generate a SQL expression for binning a numeric field.
 * Uses FLOOR(value / binWidth) * binWidth to create bin boundaries.
 * 
 * @param sourceField - The column name to bin
 * @param binWidth - The width of each bin
 * @returns SQL expression string
 * 
 * @example
 * generateBinExpression("Revenue", 100)
 * // Returns: 'FLOOR(Revenue / 100) * 100'
 */
export function generateBinExpression(sourceField: string, binWidth: number): string {
  // Quote field names so columns with spaces/special chars are always valid.
  // Use SQL-style double quotes and escape embedded double quotes by doubling them.
  const escapedField = sourceField.replace(/"/g, '""');
  return `FLOOR("${escapedField}" / ${binWidth}) * ${binWidth}`;
}

/**
 * Generate a default name for a binned field.
 * The name must be a valid SQL identifier (letters, numbers, underscores only).
 * 
 * @param sourceField - The original field name being binned
 * @returns Default name like "Revenue_bin"
 */
export function generateBinFieldName(sourceField: string): string {
  // Replace dots, spaces, and other invalid characters with underscores
  const sanitized = sourceField.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${sanitized}_bin`;
}

/**
 * Round a number to a "nice" value for human-readable bin widths.
 * Nice values follow the pattern: 1, 2, 5, 10, 20, 50, 100, 200, 500, etc.
 * 
 * @param value - The raw value to round
 * @returns A nice rounded value
 */
export function roundToNiceNumber(value: number): number {
  if (value <= 0) return 1;
  
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  
  let niceFraction: number;
  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  
  return niceFraction * Math.pow(10, exponent);
}

/**
 * Calculate a suggested bin width using Sturges' rule.
 * Sturges' rule: k = ceil(log2(n) + 1) where n is the number of observations.
 * 
 * @param min - Minimum value in the data
 * @param max - Maximum value in the data
 * @param rowCount - Number of rows/observations
 * @returns Suggested bin width (rounded to nice number)
 */
export function suggestBinWidth(min: number, max: number, rowCount: number): number {
  if (rowCount <= 0) return 1;
  if (max <= min) return 1;
  
  // Sturges' rule for number of bins
  const binCount = Math.ceil(Math.log2(rowCount) + 1);
  
  // Calculate raw bin width
  const rawWidth = (max - min) / binCount;
  
  // Round to a nice number for readability
  return roundToNiceNumber(rawWidth);
}

/**
 * Calculate bin width from a desired number of bins.
 * 
 * @param min - Minimum value in the data
 * @param max - Maximum value in the data
 * @param binCount - Desired number of bins
 * @returns Bin width (rounded to nice number)
 */
export function binWidthFromCount(min: number, max: number, binCount: number): number {
  if (binCount <= 0) return 1;
  if (max <= min) return 1;
  
  const rawWidth = (max - min) / binCount;
  return roundToNiceNumber(rawWidth);
}

/**
 * Calculate the number of bins for a given bin width.
 * 
 * @param min - Minimum value in the data
 * @param max - Maximum value in the data
 * @param binWidth - Width of each bin
 * @returns Number of bins
 */
export function calculateBinCount(min: number, max: number, binWidth: number): number {
  if (binWidth <= 0) return 1;
  if (max <= min) return 1;
  
  return Math.ceil((max - min) / binWidth);
}

/**
 * Generate example bin labels for preview.
 * 
 * @param min - Minimum value in the data
 * @param binWidth - Width of each bin
 * @param count - Number of example bins to generate (default 3)
 * @returns Array of bin boundary values
 */
export function generateBinExamples(min: number, binWidth: number, count: number = 3): number[] {
  // Start from the bin that contains the minimum value
  const startBin = Math.floor(min / binWidth) * binWidth;
  
  const examples: number[] = [];
  for (let i = 0; i < count; i++) {
    examples.push(startBin + i * binWidth);
  }
  
  return examples;
}

/**
 * Create a VirtualColumnDefinition for a binned field.
 * 
 * @param sourceField - The column name to bin
 * @param binWidth - The width of each bin
 * @param customName - Optional custom name (defaults to "sourceField (bin)")
 * @returns VirtualColumnDefinition ready to be added to virtualColumns array
 */
export function createBinnedFieldDefinition(
  sourceField: string,
  binWidth: number,
  customName?: string
): VirtualColumnDefinition {
  const name = customName || generateBinFieldName(sourceField);
  
  const binConfig: BinnedFieldDefinition = {
    name,
    sourceField,
    binWidth,
  };
  
  return {
    name,
    expression: generateBinExpression(sourceField, binWidth),
    // Don't set output_type - FLOOR() result is naturally numeric and avoids
    // ClickHouse CAST issues (NUMERIC requires precision/scale)
    description: `Bins of ${sourceField} with width ${binWidth}`,
    binConfig,
  };
}

/**
 * Check if a VirtualColumnDefinition is a binned field.
 * 
 * @param vc - VirtualColumnDefinition to check
 * @returns true if this is a binned field
 */
export function isBinnedField(vc: VirtualColumnDefinition): boolean {
  return vc.binConfig !== undefined;
}
