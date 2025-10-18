/**
 * Optimization Hint Generator
 * 
 * Generates intelligent optimization hints based on chart type and field configuration.
 * Frontend uses this to explicitly tell backend what optimizations to apply,
 * rather than backend inferring from query structure.
 */

import { OptimizationHints, Dimension, Measure, Field } from '../types';

/**
 * Chart type definitions
 */
export type ChartType = 'scatter' | 'bar' | 'line' | 'heatmap' | 'histogram' | 'table' | 'unknown';

/**
 * User preference for optimization aggressiveness
 */
export type OptimizationPreference = 'none' | 'light' | 'balanced' | 'aggressive' | 'auto';

/**
 * Chart-specific optimization profiles
 * These define the default optimization strategy for each chart type
 */
const OPTIMIZATION_PROFILES: Record<ChartType, Partial<OptimizationHints>> = {
    // Scatter plots: High priority for DISTINCT + rounding (removes duplicate points)
    scatter: {
        enable_distinct: true,
        enable_rounding: true,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'balanced',
        purpose: 'scatter_plot_deduplication'
    },
    
    // Bar charts: Aggregated data, no deduplication needed
    // Backend will skip optimizations for aggregated queries anyway
    bar: {
        enable_distinct: false,
        enable_rounding: false,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'light',
        purpose: 'bar_chart_aggregation'
    },
    
    // Line charts: Similar to bar charts, usually aggregated
    line: {
        enable_distinct: false,
        enable_rounding: false,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'light',
        purpose: 'line_chart_aggregation'
    },
    
    // Heatmaps: May benefit from rounding and distinct
    heatmap: {
        enable_distinct: true,
        enable_rounding: true,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'balanced',
        purpose: 'heatmap_density'
    },
    
    // Histograms: Usually aggregated, no optimization needed
    histogram: {
        enable_distinct: false,
        enable_rounding: false,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'light',
        purpose: 'histogram_binning'
    },
    
    // Raw table view: May benefit from distinct
    table: {
        enable_distinct: true,
        enable_rounding: false,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'light',
        purpose: 'table_view'
    },
    
    // Unknown: Conservative defaults
    unknown: {
        enable_distinct: false,
        enable_rounding: false,
        enable_sampling: false,
        enable_binning: false,
        optimization_level: 'light',
        purpose: 'unknown_chart_type'
    }
};

/**
 * Determine chart type from field configuration
 * 
 * @param dimensions - Array of dimension fields
 * @param measures - Array of measure fields
 * @param explicitChartType - Optional explicit chart type override
 * @returns Inferred or explicit chart type
 */
export function inferChartType(
    dimensions: Dimension[],
    measures: Measure[],
    explicitChartType?: ChartType
): ChartType {
    // If explicitly provided, use that
    if (explicitChartType) {
        return explicitChartType;
    }
    
    const hasMeasures = measures && measures.length > 0;
    const continuousDims = dimensions?.filter(d => d.flavour === 'continuous') || [];
    const discreteDims = dimensions?.filter(d => d.flavour === 'discrete') || [];
    
    // Scatter plot: 2+ continuous dimensions, no measures (raw data)
    if (continuousDims.length >= 2 && !hasMeasures) {
        return 'scatter';
    }
    
    // Bar/Line chart: 1 discrete + measures
    if (discreteDims.length >= 1 && hasMeasures) {
        // Could be bar or line - default to bar
        return 'bar';
    }
    
    // Heatmap: 2 discrete dimensions + measure
    if (discreteDims.length >= 2 && hasMeasures) {
        return 'heatmap';
    }
    
    // Histogram: 1 continuous dimension + measure
    if (continuousDims.length === 1 && hasMeasures) {
        return 'histogram';
    }
    
    // Table: Any raw data query
    if (!hasMeasures) {
        return 'table';
    }
    
    return 'unknown';
}

/**
 * Get recommended optimization level based on field count and chart type
 * 
 * @param chartType - Type of chart being rendered
 * @param totalFields - Total number of fields (dimensions + measures)
 * @returns Recommended optimization level
 */
export function getRecommendedOptimizationLevel(
    chartType: ChartType,
    totalFields: number
): 'light' | 'balanced' | 'aggressive' {
    // For scatter plots with many fields, be more aggressive
    if (chartType === 'scatter') {
        if (totalFields >= 4) return 'aggressive'; // e.g., x, y, color, size
        if (totalFields >= 2) return 'balanced';
        return 'light';
    }
    
    // For heatmaps, balanced optimization
    if (chartType === 'heatmap') {
        return 'balanced';
    }
    
    // For aggregated charts (bar, line, histogram), light optimization
    if (['bar', 'line', 'histogram'].includes(chartType)) {
        return 'light';
    }
    
    // Default: balanced
    return 'balanced';
}

/**
 * Determine if rounding should be enabled based on field configuration
 * 
 * @param dimensions - Array of dimension fields
 * @param chartType - Type of chart
 * @returns Whether rounding should be enabled
 */
function shouldEnableRounding(dimensions: Dimension[], chartType: ChartType): boolean {
    const continuousDims = dimensions?.filter(d => d.flavour === 'continuous') || [];
    
    // Rounding is beneficial for scatter plots with 2+ continuous dimensions
    if (chartType === 'scatter' && continuousDims.length >= 2) {
        return true;
    }
    
    // Rounding can help with heatmaps
    if (chartType === 'heatmap' && continuousDims.length >= 1) {
        return true;
    }
    
    return false;
}

/**
 * Determine if DISTINCT should be enabled based on field configuration
 * 
 * @param dimensions - Array of dimension fields
 * @param measures - Array of measure fields
 * @param chartType - Type of chart
 * @returns Whether DISTINCT should be enabled
 */
function shouldEnableDistinct(
    dimensions: Dimension[],
    measures: Measure[],
    chartType: ChartType
): boolean {
    const hasMeasures = measures && measures.length > 0;
    
    // DISTINCT is only useful for raw data queries (no aggregation)
    if (hasMeasures) {
        return false; // GROUP BY handles deduplication
    }
    
    // For raw data queries, DISTINCT is beneficial
    if (['scatter', 'table', 'heatmap'].includes(chartType)) {
        return true;
    }
    
    return false;
}

/**
 * Main function: Generate optimization hints based on chart configuration
 * 
 * @param options - Configuration options
 * @returns Complete OptimizationHints object
 */
export function generateOptimizationHints(options: {
    dimensions: Dimension[];
    measures: Measure[];
    chartType?: ChartType;
    userPreference?: OptimizationPreference;
    customRoundingThreshold?: number;
}): OptimizationHints {
    const {
        dimensions = [],
        measures = [],
        chartType: explicitChartType,
        userPreference = 'auto',
        customRoundingThreshold
    } = options;
    
    // Handle user preference override
    if (userPreference === 'none') {
        return {
            enable_distinct: false,
            enable_rounding: false,
            enable_sampling: false,
            enable_binning: false,
            optimization_level: 'none',
            purpose: 'user_disabled'
        };
    }
    
    // Infer chart type if not provided
    const chartType = inferChartType(dimensions, measures, explicitChartType);
    
    // Get base profile for chart type
    const baseProfile = OPTIMIZATION_PROFILES[chartType];
    
    // Determine optimization settings based on analysis
    const enableDistinct = shouldEnableDistinct(dimensions, measures, chartType);
    const enableRounding = shouldEnableRounding(dimensions, chartType);
    
    // Get recommended optimization level
    const totalFields = (dimensions?.length || 0) + (measures?.length || 0);
    const recommendedLevel = getRecommendedOptimizationLevel(chartType, totalFields);
    
    // Apply user preference
    let optimizationLevel: 'none' | 'light' | 'balanced' | 'aggressive';
    if (userPreference === 'auto') {
        optimizationLevel = recommendedLevel;
    } else {
        optimizationLevel = userPreference;
    }
    
    // Build final hints
    const hints: OptimizationHints = {
        enable_distinct: enableDistinct,
        enable_rounding: enableRounding,
        enable_sampling: false, // Reserved for future
        enable_binning: false,  // Reserved for future
        optimization_level: optimizationLevel,
        purpose: baseProfile.purpose || `${chartType}_chart`,
        ...(customRoundingThreshold && { rounding_threshold: customRoundingThreshold })
    };
    
    return hints;
}

/**
 * Helper: Generate hints from Field objects (used in components)
 * 
 * @param xAxisFields - Fields on X axis
 * @param yAxisFields - Fields on Y axis
 * @param colorField - Optional color field
 * @param sizeField - Optional size field
 * @param chartType - Optional explicit chart type
 * @param userPreference - User's optimization preference
 * @returns Complete OptimizationHints object
 */
export function generateOptimizationHintsFromFields(options: {
    xAxisFields: Field[];
    yAxisFields: Field[];
    colorField?: Field | null;
    sizeField?: Field | null;
    chartType?: ChartType;
    userPreference?: OptimizationPreference;
}): OptimizationHints {
    const { xAxisFields, yAxisFields, colorField, sizeField, chartType, userPreference } = options;
    
    // Convert Fields to Dimensions and Measures
    const dimensions: Dimension[] = [];
    const measures: Measure[] = [];
    
    // Process X axis fields
    xAxisFields.forEach(field => {
        if (field.type === 'dimension') {
            dimensions.push({
                field: field.columnName,
                flavour: field.flavour,
                axis: 'x',
                ...(field.dateTimePart && { date_part: field.dateTimePart }),
                ...(field.dateTimeMode && { date_mode: field.dateTimeMode })
            });
        } else if (field.type === 'measure' && field.aggregation) {
            measures.push({
                field: field.columnName,
                aggregation: field.aggregation,
                alias: field.columnName
            });
        }
    });
    
    // Process Y axis fields
    yAxisFields.forEach(field => {
        if (field.type === 'dimension') {
            dimensions.push({
                field: field.columnName,
                flavour: field.flavour,
                axis: 'y',
                ...(field.dateTimePart && { date_part: field.dateTimePart }),
                ...(field.dateTimeMode && { date_mode: field.dateTimeMode })
            });
        } else if (field.type === 'measure' && field.aggregation) {
            measures.push({
                field: field.columnName,
                aggregation: field.aggregation,
                alias: field.columnName
            });
        }
    });
    
    // Add color field as dimension if it's discrete
    if (colorField && colorField.type === 'dimension') {
        dimensions.push({
            field: colorField.columnName,
            flavour: colorField.flavour,
            ...(colorField.dateTimePart && { date_part: colorField.dateTimePart }),
            ...(colorField.dateTimeMode && { date_mode: colorField.dateTimeMode })
        });
    }
    
    // Add size field if it's a measure
    if (sizeField && sizeField.type === 'measure' && sizeField.aggregation) {
        measures.push({
            field: sizeField.columnName,
            aggregation: sizeField.aggregation,
            alias: sizeField.columnName
        });
    }
    
    // Generate hints
    return generateOptimizationHints({
        dimensions,
        measures,
        chartType,
        userPreference
    });
}

/**
 * Get human-readable description of optimization hints
 * 
 * @param hints - OptimizationHints object
 * @returns Human-readable description
 */
export function describeOptimizationHints(hints: OptimizationHints): string {
    const enabled: string[] = [];
    
    if (hints.enable_distinct) enabled.push('DISTINCT');
    if (hints.enable_rounding) enabled.push('Rounding');
    if (hints.enable_sampling) enabled.push('Sampling');
    if (hints.enable_binning) enabled.push('Binning');
    
    if (enabled.length === 0) {
        return `No optimizations (${hints.optimization_level} level)`;
    }
    
    return `${enabled.join(' + ')} (${hints.optimization_level} level)`;
}
