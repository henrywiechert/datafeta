/**
 * HintsTab Component
 * Compares requested hints vs hints actually used
 */

import React from 'react';
import { OptimizationHints, OptimizationOverride } from '../../../types';
import { HintsDisplay } from '../hints/HintsDisplay';
import { HintsComparison } from '../hints/HintsComparison';
import { formatOverrideReason } from '../utils/formatters';

interface HintsTabProps {
    requestedHints: OptimizationHints | null;
    hintsUsed: OptimizationHints | null | undefined;
    override: OptimizationOverride | null | undefined;
}

export const HintsTab: React.FC<HintsTabProps> = ({ requestedHints, hintsUsed, override }) => {
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
