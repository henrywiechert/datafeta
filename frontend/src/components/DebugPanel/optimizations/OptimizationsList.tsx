/**
 * OptimizationsList Component
 * Displays all optimizations that were applied
 */

import React from 'react';
import { OptimizationMetadata } from '../../../types';
import { OptimizationItem } from './OptimizationItem';

interface OptimizationsListProps {
    optimizationsApplied: OptimizationMetadata[];
}

export const OptimizationsList: React.FC<OptimizationsListProps> = ({ optimizationsApplied }) => {
    if (!optimizationsApplied || optimizationsApplied.length === 0) {
        return null;
    }

    return (
        <div className="debug-section">
            <h4 className="debug-section-title">
                <span className="success-icon">✓</span>
                Optimizations Actually Applied
            </h4>
            <div className="optimizations-list">
                {optimizationsApplied.map((opt, index) => (
                    <OptimizationItem key={index} optimization={opt} />
                ))}
            </div>
        </div>
    );
};
