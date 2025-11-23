/**
 * SqlTab Component
 * Shows the generated SQL query
 */

import React, { useState } from 'react';

interface SqlTabProps {
    querySql?: string;
}

export const SqlTab: React.FC<SqlTabProps> = ({ querySql }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (querySql) {
            navigator.clipboard.writeText(querySql);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!querySql) {
        return <div className="no-sql">No SQL query available.</div>;
    }

    return (
        <div className="sql-tab">
            <div className="sql-header">
                <h4 className="debug-section-title">Generated SQL</h4>
                <button className="copy-button" onClick={handleCopy} disabled={copied}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
            </div>
            <pre className="sql-display">
                <code>{querySql}</code>
            </pre>
        </div>
    );
};
