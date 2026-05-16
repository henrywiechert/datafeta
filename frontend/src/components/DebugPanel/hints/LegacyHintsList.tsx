// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * LegacyHintsList Component
 * Displays legacy optimization hints (for backward compatibility)
 */

import React from 'react';
import { OptimizationHints } from '../../../types';

interface LegacyHintsListProps {
    hints: OptimizationHints;
}

export const LegacyHintsList: React.FC<LegacyHintsListProps> = ({ hints }) => {
    const hasFieldHints = hints.field_hints && hints.field_hints.length > 0;
    const hasLegacyHints = hints.enable_distinct || hints.enable_rounding || hints.enable_sampling || hints.enable_binning;

    if (hasFieldHints || !hasLegacyHints) {
        return null;
    }

    return (
        <div className="legacy-hints-section">
            <div className="legacy-hints-warning">⚠️ Legacy format (pre-field-level)</div>
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
                {hints.rounding_threshold && (
                    <div className="hint-row">
                        <span className="hint-label">Rounding Threshold:</span>
                        <span className="hint-value">{hints.rounding_threshold.toLocaleString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
