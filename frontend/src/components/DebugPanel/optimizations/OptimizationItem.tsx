// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * OptimizationItem Component
 * Displays a single optimization that was applied
 */

import React from 'react';
import { OptimizationMetadata } from '../../../types';
import { formatStrategyName } from '../utils/formatters';

interface OptimizationItemProps {
    optimization: OptimizationMetadata;
}

export const OptimizationItem: React.FC<OptimizationItemProps> = ({ optimization }) => {
    return (
        <div className="optimization-item">
            <div className="optimization-header">
                <span className="optimization-strategy">{formatStrategyName(optimization.strategy)}</span>
                {optimization.reduction && (
                    <span className="optimization-reduction">{optimization.reduction}</span>
                )}
            </div>
            {optimization.details && (
                <div className="optimization-details">{optimization.details}</div>
            )}
            {/* Display field-level rounding config */}
            {optimization.rounding_config && Object.keys(optimization.rounding_config).length > 0 && (
                <div className="field-optimization-details">
                    <div className="field-optimization-title">Fields rounded:</div>
                    <div className="field-optimization-list">
                        {Object.entries(optimization.rounding_config).map(([field, precision]) => (
                            <span key={field} className="field-optimization-badge">
                                {`📊 ${field}: ${precision} decimals`}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
