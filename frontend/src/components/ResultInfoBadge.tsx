/**
 * ResultInfoBadge Component
 * 
 * Displays result dimensions (rows × columns) prominently.
 * Shows at a glance how much data was returned.
 */

import React from 'react';
import './ResultInfoBadge.css';

interface ResultInfoBadgeProps {
    rows: number;
    columns: number;
    sizeDisplay?: string;
    className?: string;
    showDetails?: boolean;
}

/**
 * ResultInfoBadge - Compact badge showing result size
 */
export const ResultInfoBadge: React.FC<ResultInfoBadgeProps> = ({
    rows,
    columns,
    sizeDisplay,
    className = '',
    showDetails = false
}) => {
    // Determine color based on result size
    const getSizeCategory = (): 'small' | 'medium' | 'large' | 'very-large' => {
        if (rows < 100) return 'small';
        if (rows < 1000) return 'medium';
        if (rows < 10000) return 'large';
        return 'very-large';
    };

    const category = getSizeCategory();
    const displayText = sizeDisplay || `${rows.toLocaleString()} × ${columns}`;

    return (
        <div className={`result-info-badge ${category} ${className}`} title={getTooltipText(rows, columns)}>
            <span className="result-icon">📊</span>
            <span className="result-text">{displayText}</span>
            {showDetails && (
                <div className="result-details">
                    <div className="detail-item">
                        <span className="detail-label">Rows:</span>
                        <span className="detail-value">{rows.toLocaleString()}</span>
                    </div>
                    <div className="detail-item">
                        <span className="detail-label">Cols:</span>
                        <span className="detail-value">{columns}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Generate tooltip text
 */
function getTooltipText(rows: number, columns: number): string {
    const total = rows * columns;
    return `${rows.toLocaleString()} rows × ${columns} columns = ${total.toLocaleString()} data points`;
}

/**
 * Compact inline badge (for headers, toolbars)
 */
export const ResultInfoBadgeCompact: React.FC<ResultInfoBadgeProps> = ({
    rows,
    columns,
    sizeDisplay,
    className = ''
}) => {
    const displayText = sizeDisplay || `${rows.toLocaleString()} × ${columns}`;

    return (
        <span className={`result-info-badge-compact ${className}`} title={getTooltipText(rows, columns)}>
            {displayText}
        </span>
    );
};

/**
 * Detailed card view (for dedicated result info section)
 */
export const ResultInfoCard: React.FC<ResultInfoBadgeProps & {
    queryTime?: number;
    optimizationsApplied?: number;
}> = ({
    rows,
    columns,
    sizeDisplay,
    queryTime,
    optimizationsApplied,
    className = ''
}) => {
    const total = rows * columns;

    return (
        <div className={`result-info-card ${className}`}>
            <div className="result-info-header">
                <span className="card-icon">📊</span>
                <h4 className="card-title">Query Result</h4>
            </div>
            
            <div className="result-info-grid">
                <div className="info-item primary">
                    <span className="info-label">Result Size</span>
                    <span className="info-value large">{sizeDisplay || `${rows.toLocaleString()} × ${columns}`}</span>
                </div>
                
                <div className="info-item">
                    <span className="info-label">Rows</span>
                    <span className="info-value">{rows.toLocaleString()}</span>
                </div>
                
                <div className="info-item">
                    <span className="info-label">Columns</span>
                    <span className="info-value">{columns}</span>
                </div>
                
                <div className="info-item">
                    <span className="info-label">Total Data Points</span>
                    <span className="info-value">{total.toLocaleString()}</span>
                </div>
                
                {queryTime !== undefined && (
                    <div className="info-item">
                        <span className="info-label">Query Time</span>
                        <span className="info-value">{queryTime}ms</span>
                    </div>
                )}
                
                {optimizationsApplied !== undefined && optimizationsApplied > 0 && (
                    <div className="info-item success">
                        <span className="info-label">Optimizations</span>
                        <span className="info-value">{optimizationsApplied} applied</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultInfoBadge;
