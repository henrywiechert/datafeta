/**
 * Optimization Hint Generator
 * 
 * Generates intelligent field-level optimization hints based on field characteristics.
 * Frontend uses this to explicitly tell backend what optimizations to apply
 * to each field, making it faceting-aware and more precise.
 */

import { OptimizationHints, FieldOptimizationHint, Dimension, Measure, Field } from '../types';

/**
 * User preference for optimization aggressiveness
 */
export type OptimizationPreference = 'none' | 'light' | 'balanced' | 'aggressive' | 'auto';

/**
 * Default rounding thresholds for different optimization levels
 */
const ROUNDING_THRESHOLDS: Record<'light' | 'balanced' | 'aggressive', number> = {
    light: 1000,
    balanced: 500,
    aggressive: 200
};

/**
 * Generate optimization hint for a single field based on its characteristics.
 * 
 * @param field - The field to analyze
 * @param optimizationLevel - User's optimization preference
 * @returns Field-specific optimization hint
 */
function generateFieldOptimizationHint(
    field: Field,
    optimizationLevel: 'light' | 'balanced' | 'aggressive'
): FieldOptimizationHint {
    const hint: FieldOptimizationHint = {
        field: field.columnName,
        enable_rounding: false,
        enable_sampling: false,
        reason: ''
    };
    
    // Continuous dimensions benefit from rounding (removes duplicate coordinates in scatter plots, etc.)
    if (field.type === 'dimension' && field.flavour === 'continuous') {
        hint.enable_rounding = true;
        hint.rounding_threshold = ROUNDING_THRESHOLDS[optimizationLevel];
        hint.reason = 'continuous_dimension';
    }
    
    // DateTime timeline dimensions need binning/rounding for temporal bucketing
    if (field.dateTimeMode === 'timeline') {
        hint.enable_rounding = true;
        hint.rounding_threshold = ROUNDING_THRESHOLDS[optimizationLevel];
        hint.reason = 'datetime_timeline';
    }
    
    // Future: High-cardinality measures might benefit from sampling
    // This would require cardinality estimation, which we don't have yet
    
    return hint;
}

/**
 * Get recommended optimization level based on field characteristics.
 * 
 * @param dimensions - Array of dimension fields
 * @param measures - Array of measure fields
 * @param totalFields - Total number of fields
 * @returns Recommended optimization level
 */
function getRecommendedOptimizationLevel(
    dimensions: Dimension[],
    measures: Measure[],
    totalFields: number
): 'light' | 'balanced' | 'aggressive' {
    const hasMeasures = measures && measures.length > 0;
    const continuousDims = dimensions?.filter(d => d.flavour === 'continuous') || [];
    
    // Raw data queries with multiple continuous dimensions benefit from aggressive optimization
    if (!hasMeasures && continuousDims.length >= 2) {
        if (totalFields >= 4) return 'aggressive';
        return 'balanced';
    }
    
    // Raw data queries with continuous dimensions
    if (!hasMeasures && continuousDims.length >= 1) {
        return 'balanced';
    }
    
    // Aggregated queries need less aggressive optimization
    if (hasMeasures) {
        return 'light';
    }
    
    // Default: balanced
    return 'balanced';
}

/**
 * Determine if global DISTINCT should be enabled based on query type.
 * DISTINCT is only useful for raw data queries (no aggregation).
 * 
 * @param measures - Array of measure fields
 * @returns Whether global DISTINCT should be enabled
 */
function shouldEnableGlobalDistinct(measures: Measure[]): boolean {
    const hasMeasures = measures && measures.length > 0;
    
    // DISTINCT is only useful for raw data queries (no aggregation)
    // GROUP BY handles deduplication for aggregated queries
    return !hasMeasures;
}

/**
 * Main function: Generate field-level optimization hints based on field characteristics.
 * 
 * @param options - Configuration options
 * @returns Complete OptimizationHints object with field-level hints
 */
export function generateOptimizationHints(options: {
    dimensions: Dimension[];
    measures: Measure[];
    userPreference?: OptimizationPreference;
}): OptimizationHints {
    const {
        dimensions = [],
        measures = [],
        userPreference = 'auto'
    } = options;
    
    // Handle user preference override
    if (userPreference === 'none') {
        return {
            field_hints: [],
            enable_global_distinct: false,
            optimization_level: 'none',
            purpose: 'user_disabled'
        };
    }
    
    // Get recommended optimization level
    const totalFields = (dimensions?.length || 0) + (measures?.length || 0);
    const recommendedLevel = getRecommendedOptimizationLevel(dimensions, measures, totalFields);
    
    // Apply user preference
    const optimizationLevel: 'light' | 'balanced' | 'aggressive' = 
        userPreference === 'auto' ? recommendedLevel : userPreference as any;
    
    // Generate field-level hints for all dimensions
    // (Measures don't currently need field-level optimization hints)
    const fieldHints: FieldOptimizationHint[] = [];
    
    console.log(`📊 Analyzing ${dimensions.length} dimensions for optimization:`, 
        dimensions.map(d => ({ field: d.field, flavour: d.flavour, date_mode: d.date_mode })));
    
    for (const dim of dimensions) {
        const hint = generateFieldOptimizationHint(
            {
                columnName: dim.field,
                type: 'dimension',
                flavour: dim.flavour,
                dateTimeMode: dim.date_mode,
                dateTimePart: dim.date_part
            } as Field,
            optimizationLevel
        );
        
        console.log(`  Field '${dim.field}': rounding=${hint.enable_rounding}, sampling=${hint.enable_sampling}, reason=${hint.reason}`);
        
        // Only include hints that actually enable some optimization
        if (hint.enable_rounding || hint.enable_sampling) {
            fieldHints.push(hint);
        }
    }
    
    console.log(`✅ Generated ${fieldHints.length} field hints from ${dimensions.length} dimensions`);
    
    // Determine if global DISTINCT should be applied
    const enableGlobalDistinct = shouldEnableGlobalDistinct(measures);
    
    // Build final hints
    const hints: OptimizationHints = {
        field_hints: fieldHints,
        enable_global_distinct: enableGlobalDistinct,
        optimization_level: optimizationLevel,
        purpose: 'field_based_optimization'
    };
    
    console.log('🔧 Generated field-level optimization hints:', hints);
    
    return hints;
}

/**
 * Helper: Generate field-level hints from Field objects (used in components).
 * 
 * @param xAxisFields - Fields on X axis
 * @param yAxisFields - Fields on Y axis
 * @param colorField - Optional color field
 * @param sizeField - Optional size field
 * @param userPreference - User's optimization preference
 * @returns Complete OptimizationHints object with field-level hints
 */
export function generateOptimizationHintsFromFields(options: {
    xAxisFields: Field[];
    yAxisFields: Field[];
    colorField?: Field | null;
    sizeField?: Field | null;
    userPreference?: OptimizationPreference;
}): OptimizationHints {
    const { xAxisFields, yAxisFields, colorField, sizeField, userPreference } = options;
    
    // Collect all unique fields
    const allFields: Field[] = [
        ...xAxisFields,
        ...yAxisFields,
        ...(colorField ? [colorField] : []),
        ...(sizeField ? [sizeField] : [])
    ];
    
    // Remove duplicates based on columnName
    const uniqueFields = allFields.filter(
        (field, index, self) => 
            index === self.findIndex(f => f.columnName === field.columnName)
    );
    
    // Separate dimensions and measures
    const dimensions: Dimension[] = [];
    const measures: Measure[] = [];
    
    uniqueFields.forEach(field => {
        if (field.type === 'dimension') {
            console.log('Processing field:', field.columnName, 'flavour:', field.flavour, 'dateTimeMode:', field.dateTimeMode);
            dimensions.push({
                field: field.columnName,
                flavour: field.flavour,
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
    
    // Generate field-level hints
    return generateOptimizationHints({
        dimensions,
        measures,
        userPreference
    });
}

/**
 * Get human-readable description of optimization hints.
 * 
 * @param hints - OptimizationHints object
 * @returns Human-readable description
 */
export function describeOptimizationHints(hints: OptimizationHints): string {
    const enabled: string[] = [];
    
    // Check field-level hints
    if (hints.field_hints && hints.field_hints.length > 0) {
        const roundingFields = hints.field_hints.filter(h => h.enable_rounding);
        const samplingFields = hints.field_hints.filter(h => h.enable_sampling);
        
        if (roundingFields.length > 0) {
            enabled.push(`Rounding (${roundingFields.length} field${roundingFields.length > 1 ? 's' : ''})`);
        }
        if (samplingFields.length > 0) {
            enabled.push(`Sampling (${samplingFields.length} field${samplingFields.length > 1 ? 's' : ''})`);
        }
    }
    
    // Check global distinct
    if (hints.enable_global_distinct) {
        enabled.push('DISTINCT');
    }
    
    // Backward compatibility: check old-style hints
    if (hints.enable_distinct && !hints.enable_global_distinct) {
        enabled.push('DISTINCT (legacy)');
    }
    if (hints.enable_rounding && (!hints.field_hints || hints.field_hints.length === 0)) {
        enabled.push('Rounding (legacy)');
    }
    if (hints.enable_sampling) {
        enabled.push('Sampling (legacy)');
    }
    
    if (enabled.length === 0) {
        return `No optimizations (${hints.optimization_level || 'auto'} level)`;
    }
    
    return `${enabled.join(' + ')} (${hints.optimization_level || 'auto'} level)`;
}
