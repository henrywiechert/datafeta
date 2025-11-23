/**
 * OverviewTab Component
 * Shows result dimensions, optimizations, and override info
 */

import React from 'react';
import { OptimizationMetadata, OptimizationOverride } from '../../../types';
import { ResultDimensions } from '../optimizations/ResultDimensions';
import { OverrideNotice } from '../optimizations/OverrideNotice';
import { OptimizationsList } from '../optimizations/OptimizationsList';
import { NoOptimizationsMessage } from '../optimizations/NoOptimizationsMessage';

interface OverviewTabProps {
    resultDimensions?: { rows: number; columns: number; size_display: string };
    optimizationsApplied?: OptimizationMetadata[];
    optimizationOverride?: OptimizationOverride | null;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ 
    resultDimensions, 
    optimizationsApplied, 
    optimizationOverride 
}) => {
    const hasOptimizations = optimizationsApplied && optimizationsApplied.length > 0;

    return (
        <div className="overview-tab">
            {/* Result Dimensions */}
            {resultDimensions && <ResultDimensions resultDimensions={resultDimensions} />}

            {/* Optimization Override */}
            {optimizationOverride && <OverrideNotice optimizationOverride={optimizationOverride} />}

            {/* Optimizations Applied */}
            {hasOptimizations && <OptimizationsList optimizationsApplied={optimizationsApplied} />}

            {/* No Optimizations Message */}
            {!optimizationOverride && !hasOptimizations && <NoOptimizationsMessage />}
        </div>
    );
};
