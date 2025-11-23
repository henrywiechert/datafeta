/**
 * NoOptimizationsMessage Component
 * Displays when no optimizations were applied
 */

import React from 'react';

export const NoOptimizationsMessage: React.FC = () => {
    return (
        <div className="debug-section">
            <div className="no-optimizations">
                <strong>No optimizations were applied to this query.</strong>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#6c757d' }}>
                    This usually means:
                    <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                        <li>Dataset is too small (below threshold)</li>
                        <li>Query is aggregated (GROUP BY handles deduplication)</li>
                        <li>No continuous dimensions to optimize</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
