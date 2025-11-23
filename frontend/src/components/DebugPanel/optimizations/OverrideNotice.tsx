/**
 * OverrideNotice Component
 * Displays backend override information when optimizations are skipped
 */

import React from 'react';
import { OptimizationOverride } from '../../../types';
import { formatOverrideReason } from '../utils/formatters';

interface OverrideNoticeProps {
    optimizationOverride: OptimizationOverride;
}

export const OverrideNotice: React.FC<OverrideNoticeProps> = ({ optimizationOverride }) => {
    if (!optimizationOverride.skip_all_optimizations) {
        return null;
    }

    return (
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
    );
};
