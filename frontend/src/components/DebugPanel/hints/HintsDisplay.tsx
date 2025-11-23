/**
 * HintsDisplay Component
 * Display optimization hints in a readable format
 */

import React from 'react';
import { OptimizationHints } from '../../../types';
import { FieldHintsList } from './FieldHintsList';
import { LegacyHintsList } from './LegacyHintsList';

interface HintsDisplayProps {
    hints: OptimizationHints;
}

export const HintsDisplay: React.FC<HintsDisplayProps> = ({ hints }) => {
    const hasFieldHints = hints.field_hints && hints.field_hints.length > 0;
    const hasAnyHints = hasFieldHints || hints.enable_distinct || hints.enable_rounding || 
                       hints.enable_sampling || hints.enable_binning || hints.enable_global_distinct;

    return (
        <div className="hints-container">
            {/* Global Settings */}
            <div className="hints-grid">
                <div className="hint-row">
                    <span className="hint-label">Global DISTINCT:</span>
                    <span className={`hint-value ${hints.enable_global_distinct ? 'enabled' : 'disabled'}`}>
                        {hints.enable_global_distinct ? '✓ Enabled' : '✗ Disabled'}
                    </span>
                </div>
                <div className="hint-row">
                    <span className="hint-label">Optimization Level:</span>
                    <span className={`hint-value level-${hints.optimization_level}`}>
                        {hints.optimization_level}
                    </span>
                </div>
                {hints.purpose && (
                    <div className="hint-row full-width">
                        <span className="hint-label">Purpose:</span>
                        <span className="hint-value hint-purpose">{hints.purpose}</span>
                    </div>
                )}
            </div>

            {/* Field-Level Hints */}
            <FieldHintsList hints={hints} />

            {/* Legacy Hints (for backward compatibility) */}
            <LegacyHintsList hints={hints} />

            {/* No hints message */}
            {!hasAnyHints && (
                <div className="no-field-hints">
                    No optimization hints configured.
                </div>
            )}
        </div>
    );
};
