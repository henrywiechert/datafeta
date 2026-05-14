// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DebugPanel Component
 * 
 * Displays optimization information, SQL queries, and result metadata.
 * Helps users understand what optimizations were applied and why.
 */

import React, { useState } from 'react';
import { QueryResult, OptimizationHints } from '../../types';
import { OverviewTab } from './tabs/OverviewTab';
import { HintsTab } from './tabs/HintsTab';
import { SqlTab } from './tabs/SqlTab';
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

export default DebugPanel;
