// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * HintsComparison Component
 * Compare requested vs used hints
 */

import React from 'react';
import { OptimizationHints } from '../../../types';

interface HintsComparisonProps {
    requested: OptimizationHints;
    used: OptimizationHints;
}

export const HintsComparison: React.FC<HintsComparisonProps> = ({ requested, used }) => {
    const differences: Array<{ field: string; requested: any; used: any }> = [];

    // Check global settings
    if (requested.enable_global_distinct !== used.enable_global_distinct) {
        differences.push({ 
            field: 'enable_global_distinct', 
            requested: requested.enable_global_distinct, 
            used: used.enable_global_distinct 
        });
    }
    if (requested.optimization_level !== used.optimization_level) {
        differences.push({ 
            field: 'optimization_level', 
            requested: requested.optimization_level, 
            used: used.optimization_level 
        });
    }

    // Check field-level hints
    const requestedFieldHints = requested.field_hints || [];
    const usedFieldHints = used.field_hints || [];
    
    if (requestedFieldHints.length !== usedFieldHints.length) {
        differences.push({
            field: 'field_hints_count',
            requested: requestedFieldHints.length,
            used: usedFieldHints.length
        });
    }

    // Check legacy hints for backward compatibility
    if (requested.enable_distinct !== used.enable_distinct && requested.enable_distinct !== undefined) {
        differences.push({ field: 'enable_distinct', requested: requested.enable_distinct, used: used.enable_distinct });
    }
    if (requested.enable_rounding !== used.enable_rounding && requested.enable_rounding !== undefined) {
        differences.push({ field: 'enable_rounding', requested: requested.enable_rounding, used: used.enable_rounding });
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
