/**
 * Formatting utilities for DebugPanel components
 */

/**
 * Format strategy name for display
 */
export function formatStrategyName(strategy: string): string {
    const nameMap: Record<string, string> = {
        'distinct_pairs': 'DISTINCT Pairs',
        'adaptive_rounding': 'Adaptive Rounding',
        'category_dedup': 'Category Deduplication',
        'sampling': 'Sampling',
        'binning': 'Binning'
    };
    return nameMap[strategy] || strategy;
}

/**
 * Format override reason for display
 */
export function formatOverrideReason(reason: string): string {
    const reasonMap: Record<string, string> = {
        'table_too_small': 'Table is too small (optimization would add overhead)',
        'user_disabled': 'User disabled optimizations',
        'query_too_simple': 'Query is too simple to benefit from optimization',
        'other': 'Other reason'
    };
    return reasonMap[reason] || reason;
}

/**
 * Format field hint reason for display
 */
export function formatReason(reason: string): string {
    const reasonMap: Record<string, string> = {
        'continuous_dimension': 'Continuous dimension',
        'datetime_timeline': 'DateTime timeline',
        'high_cardinality': 'High cardinality',
        'high_cardinality_measure': 'High cardinality measure'
    };
    return reasonMap[reason] || reason;
}
