/**
 * DebugPanel Component
 * 
 * Displays optimization information, SQL queries, and result metadata.
 * Helps users understand what optimizations were applied and why.
 */

import React, { useState } from 'react';
import { QueryResult, OptimizationHints, OptimizationOverride } from '../types';
import './DebugPanel.css';

interface DebugPanelProps {
    queryResult: QueryResult | null;
    requestedHints: OptimizationHints | null;
    isLoading: boolean;
    className?: string;
}

/**
 * DebugPanel - Collapsible panel showing optimization details
 */
export const DebugPanel: React.FC<DebugPanelProps> = ({
    queryResult,
    requestedHints,
    isLoading,
    className = ''
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'hints' | 'sql'>('overview');

    if (!queryResult && !isLoading) {
        return null;
    }

    const {
        result_dimensions,
        optimization_hints_used,
        optimization_override,
        optimizations_applied,
        query_sql
    } = queryResult || {};

    return (
        <div className={`debug-panel ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}>
            {/* Header - Always Visible */}
            <div className="debug-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="debug-panel-title">
                    <span className="debug-icon">🔍</span>
                    <span>Query Debug Info</span>
                    {result_dimensions && (
                        <span className="result-badge">
                            {result_dimensions.size_display}
                        </span>
                    )}
                </div>
                <button className="expand-button" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? '▼' : '▶'}
                </button>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="debug-panel-content">
                    {isLoading ? (
                        <div className="debug-loading">Loading query information...</div>
                    ) : (
                        <>
                            {/* Tabs */}
                            <div className="debug-tabs">
                                <button
                                    className={`debug-tab ${activeTab === 'overview' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    Overview
                                </button>
                                <button
                                    className={`debug-tab ${activeTab === 'hints' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('hints')}
                                >
                                    Optimization Hints
                                </button>
                                <button
                                    className={`debug-tab ${activeTab === 'sql' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('sql')}
                                >
                                    SQL Query
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="debug-tab-content">
                                {activeTab === 'overview' && (
                                    <OverviewTab
                                        resultDimensions={result_dimensions}
                                        optimizationsApplied={optimizations_applied}
                                        optimizationOverride={optimization_override}
                                    />
                                )}
                                {activeTab === 'hints' && (
                                    <HintsTab
                                        requestedHints={requestedHints}
                                        hintsUsed={optimization_hints_used}
                                        override={optimization_override}
                                    />
                                )}
                                {activeTab === 'sql' && (
                                    <SqlTab querySql={query_sql} />
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Overview Tab - Shows result dimensions, optimizations, and override info
 */
const OverviewTab: React.FC<{
    resultDimensions?: { rows: number; columns: number; size_display: string };
    optimizationsApplied?: Array<{ strategy: string; reduction?: string; details?: string }>;
    optimizationOverride?: OptimizationOverride | null;
}> = ({ resultDimensions, optimizationsApplied, optimizationOverride }) => {
    return (
        <div className="overview-tab">
            {/* Result Dimensions */}
            {resultDimensions && (
                <div className="debug-section">
                    <h4 className="debug-section-title">Result Dimensions</h4>
                    <div className="result-dimensions-detail">
                        <div className="dimension-item">
                            <span className="dimension-label">Rows:</span>
                            <span className="dimension-value">{resultDimensions.rows.toLocaleString()}</span>
                        </div>
                        <div className="dimension-item">
                            <span className="dimension-label">Columns:</span>
                            <span className="dimension-value">{resultDimensions.columns}</span>
                        </div>
                        <div className="dimension-item">
                            <span className="dimension-label">Total:</span>
                            <span className="dimension-value dimension-highlight">
                                {resultDimensions.size_display}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Optimization Override */}
            {optimizationOverride && optimizationOverride.skip_all_optimizations && (
                <div className="debug-section override-section">
                    <h4 className="debug-section-title">
                        <span className="override-icon">⚡</span>
                        Backend Override
                    </h4>
                    <div className="override-info">
                        <div className="override-message">
                            <strong>Optimizations Skipped:</strong> {formatOverrideReason(optimizationOverride.reason)}
                        </div>
                        {optimizationOverride.table_stats && (
                            <div className="override-stats">
                                <div>Table size: {optimizationOverride.table_stats.row_count.toLocaleString()} rows</div>
                                <div>Threshold: {optimizationOverride.table_stats.threshold.toLocaleString()} rows</div>
                                <div className="override-explanation">
                                    Small tables don't benefit from optimization - it would add overhead.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Optimizations Applied */}
            {optimizationsApplied && optimizationsApplied.length > 0 && (
                <div className="debug-section">
                    <h4 className="debug-section-title">
                        <span className="success-icon">✓</span>
                        Optimizations Applied
                    </h4>
                    <div className="optimizations-list">
                        {optimizationsApplied.map((opt, index) => (
                            <div key={index} className="optimization-item">
                                <div className="optimization-header">
                                    <span className="optimization-strategy">{formatStrategyName(opt.strategy)}</span>
                                    {opt.reduction && (
                                        <span className="optimization-reduction">{opt.reduction}</span>
                                    )}
                                </div>
                                {opt.details && (
                                    <div className="optimization-details">{opt.details}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No Optimizations Message */}
            {!optimizationOverride && (!optimizationsApplied || optimizationsApplied.length === 0) && (
                <div className="debug-section">
                    <div className="no-optimizations">
                        No optimizations were applied to this query.
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Hints Tab - Compares requested hints vs hints actually used
 */
const HintsTab: React.FC<{
    requestedHints: OptimizationHints | null;
    hintsUsed: OptimizationHints | null | undefined;
    override: OptimizationOverride | null | undefined;
}> = ({ requestedHints, hintsUsed, override }) => {
    const hasOverride = override && override.skip_all_optimizations;

    return (
        <div className="hints-tab">
            {/* Requested Hints (from Frontend) */}
            <div className="debug-section">
                <h4 className="debug-section-title">
                    <span className="hint-icon">📤</span>
                    Requested (Frontend)
                </h4>
                {requestedHints ? (
                    <div className="hints-display">
                        <HintsDisplay hints={requestedHints} />
                    </div>
                ) : (
                    <div className="no-hints">No optimization hints were sent with this query.</div>
                )}
            </div>

            {/* Hints Used (by Backend) */}
            <div className="debug-section">
                <h4 className="debug-section-title">
                    <span className="hint-icon">📥</span>
                    Used (Backend)
                </h4>
                {hasOverride ? (
                    <div className="override-notice">
                        <strong>Backend Override:</strong> Optimization hints were ignored.
                        <br />
                        <span className="override-reason">{formatOverrideReason(override.reason)}</span>
                    </div>
                ) : hintsUsed ? (
                    <div className="hints-display">
                        <HintsDisplay hints={hintsUsed} />
                    </div>
                ) : (
                    <div className="no-hints">Backend did not use optimization hints.</div>
                )}
            </div>

            {/* Comparison */}
            {requestedHints && hintsUsed && !hasOverride && (
                <div className="debug-section">
                    <h4 className="debug-section-title">Comparison</h4>
                    <HintsComparison requested={requestedHints} used={hintsUsed} />
                </div>
            )}
        </div>
    );
};

/**
 * Display optimization hints in a readable format
 */
const HintsDisplay: React.FC<{ hints: OptimizationHints }> = ({ hints }) => {
    return (
        <div className="hints-grid">
            <div className="hint-row">
                <span className="hint-label">DISTINCT:</span>
                <span className={`hint-value ${hints.enable_distinct ? 'enabled' : 'disabled'}`}>
                    {hints.enable_distinct ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </div>
            <div className="hint-row">
                <span className="hint-label">Rounding:</span>
                <span className={`hint-value ${hints.enable_rounding ? 'enabled' : 'disabled'}`}>
                    {hints.enable_rounding ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </div>
            <div className="hint-row">
                <span className="hint-label">Sampling:</span>
                <span className={`hint-value ${hints.enable_sampling ? 'enabled' : 'disabled'}`}>
                    {hints.enable_sampling ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </div>
            <div className="hint-row">
                <span className="hint-label">Binning:</span>
                <span className={`hint-value ${hints.enable_binning ? 'enabled' : 'disabled'}`}>
                    {hints.enable_binning ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </div>
            <div className="hint-row">
                <span className="hint-label">Optimization Level:</span>
                <span className={`hint-value level-${hints.optimization_level}`}>
                    {hints.optimization_level}
                </span>
            </div>
            {hints.rounding_threshold && (
                <div className="hint-row">
                    <span className="hint-label">Rounding Threshold:</span>
                    <span className="hint-value">{hints.rounding_threshold.toLocaleString()}</span>
                </div>
            )}
            {hints.purpose && (
                <div className="hint-row full-width">
                    <span className="hint-label">Purpose:</span>
                    <span className="hint-value hint-purpose">{hints.purpose}</span>
                </div>
            )}
        </div>
    );
};

/**
 * Compare requested vs used hints
 */
const HintsComparison: React.FC<{
    requested: OptimizationHints;
    used: OptimizationHints;
}> = ({ requested, used }) => {
    const differences: Array<{ field: string; requested: any; used: any }> = [];

    // Check each field
    if (requested.enable_distinct !== used.enable_distinct) {
        differences.push({ field: 'enable_distinct', requested: requested.enable_distinct, used: used.enable_distinct });
    }
    if (requested.enable_rounding !== used.enable_rounding) {
        differences.push({ field: 'enable_rounding', requested: requested.enable_rounding, used: used.enable_rounding });
    }
    if (requested.optimization_level !== used.optimization_level) {
        differences.push({ field: 'optimization_level', requested: requested.optimization_level, used: used.optimization_level });
    }

    if (differences.length === 0) {
        return <div className="comparison-match">✓ Hints were used exactly as requested</div>;
    }

    return (
        <div className="comparison-differences">
            <div className="comparison-warning">⚠️ Some hints were modified by backend:</div>
            {differences.map((diff, index) => (
                <div key={index} className="difference-item">
                    <strong>{diff.field}:</strong> {String(diff.requested)} → {String(diff.used)}
                </div>
            ))}
        </div>
    );
};

/**
 * SQL Tab - Shows the generated SQL query
 */
const SqlTab: React.FC<{ querySql?: string }> = ({ querySql }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (querySql) {
            navigator.clipboard.writeText(querySql);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!querySql) {
        return <div className="no-sql">No SQL query available.</div>;
    }

    return (
        <div className="sql-tab">
            <div className="sql-header">
                <h4 className="debug-section-title">Generated SQL</h4>
                <button className="copy-button" onClick={handleCopy} disabled={copied}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
            </div>
            <pre className="sql-display">
                <code>{querySql}</code>
            </pre>
        </div>
    );
};

/**
 * Helper: Format strategy name for display
 */
function formatStrategyName(strategy: string): string {
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
 * Helper: Format override reason for display
 */
function formatOverrideReason(reason: string): string {
    const reasonMap: Record<string, string> = {
        'table_too_small': 'Table is too small (optimization would add overhead)',
        'user_disabled': 'User disabled optimizations',
        'query_too_simple': 'Query is too simple to benefit from optimization',
        'other': 'Other reason'
    };
    return reasonMap[reason] || reason;
}

export default DebugPanel;
