// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * ResultDimensions Component
 * Displays query result dimensions (rows, columns, total size)
 */

import React from 'react';

interface ResultDimensionsProps {
    resultDimensions: {
        rows: number;
        columns: number;
        size_display: string;
    };
}

export const ResultDimensions: React.FC<ResultDimensionsProps> = ({ resultDimensions }) => {
    return (
        <div className="debug-section">
            <h4 className="debug-section-title">Result Dimensions</h4>
            <div className="result-dimensions-detail">
                <div className="dimension-item">
                    <span className="dimension-label">Rows:</span>
                    <span className="dimension-value">{resultDimensions.rows.toLocaleString()}</span>
                </div>
                <div className="dimension-item">
                    <span className="dimension-label">Columns:</span>
                    <span className="dimension-value">{resultDimensions.columns}</span>
                </div>
                <div className="dimension-item">
                    <span className="dimension-label">Total:</span>
                    <span className="dimension-value dimension-highlight">
                        {resultDimensions.size_display}
                    </span>
                </div>
            </div>
        </div>
    );
};
