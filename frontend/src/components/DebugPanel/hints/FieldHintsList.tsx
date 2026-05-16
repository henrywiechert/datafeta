// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * FieldHintsList Component
 * Displays field-level optimization hints
 */

import React from 'react';
import { OptimizationHints } from '../../../types';
import { formatReason } from '../utils/formatters';

interface FieldHintsListProps {
    hints: OptimizationHints;
}

export const FieldHintsList: React.FC<FieldHintsListProps> = ({ hints }) => {
    const hasFieldHints = hints.field_hints && hints.field_hints.length > 0;

    if (!hasFieldHints) {
        return null;
    }

    return (
        <div className="field-hints-section">
            <h5 className="field-hints-title">Field-Level Optimizations Requested:</h5>
            <div className="field-hints-list">
                {hints.field_hints!.map((fieldHint, index) => (
                    <div key={index} className="field-hint-item">
                        <div className="field-hint-header">
                            <span className="field-hint-name">📊 {fieldHint.field}</span>
                            <span className="field-hint-reason">{formatReason(fieldHint.reason)}</span>
                        </div>
                        <div className="field-hint-details">
                            {fieldHint.enable_rounding && (
                                <span className="field-hint-badge rounding">
                                    ✓ Rounding enabled (threshold: {fieldHint.rounding_threshold?.toLocaleString() || 'default'})
                                </span>
                            )}
                            {!fieldHint.enable_rounding && (
                                <span className="field-hint-badge" style={{ background: '#f8f9fa', color: '#6c757d', border: '1px solid #dee2e6' }}>
                                    ✗ Rounding disabled
                                </span>
                            )}
                            {fieldHint.enable_sampling && (
                                <span className="field-hint-badge sampling">
                                    ✓ Sampling enabled (rate: {fieldHint.sampling_rate ? `${(fieldHint.sampling_rate * 100).toFixed(0)}%` : 'default'})
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
