import React, { useState, useEffect } from 'react';
import { QueryDescription, QueryResult, OptimizationHints } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import styles from './DebugView.module.css';
import { DebugPanel as NewDebugPanel } from '../DebugPanel';
import { duckdbService } from '../../services/duckdbService';
import { cacheManager, CacheStats } from '../../services/cacheManager';

export interface DebugData {
  queryDescription: QueryDescription | null;
  queryResult: QueryResult | null;
  queryError: string | null;
  spec: PlotResult | null;
  chartInfo?: any;
  renderingError?: string | null;
  optimizationHints?: OptimizationHints | null;
}

interface DebugViewProps {
  debugData: DebugData;
}

/** Collapsible section component */
const CollapsibleSection: React.FC<{
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultExpanded = false, children }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className={styles.collapsibleSection}>
      <div 
        className={styles.sectionHeader} 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.collapseIcon}>{isExpanded ? '▼' : '▶'}</span>
        <h3>{title}</h3>
      </div>
      {isExpanded && (
        <div className={styles.sectionContent}>
          {children}
        </div>
      )}
    </div>
  );
};

/** DuckDB Cache Info component */
const DuckDBCacheInfo: React.FC = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [status, setStatus] = useState<'not_initialized' | 'initializing' | 'ready' | 'error'>('not_initialized');
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Update cache stats periodically
    const updateStats = () => {
      try {
        if (duckdbService) {
          setStatus(duckdbService.status === 'ready' ? 'ready' : 
                   duckdbService.status === 'initializing' ? 'initializing' : 
                   duckdbService.status === 'error' ? 'error' : 'not_initialized');
          
          // Capture error from duckdbService if available
          if (duckdbService.status === 'error' && duckdbService.lastError) {
            setError(duckdbService.lastError);
          }
          
          if (duckdbService.isReady) {
            setCacheStats(cacheManager.getStats());
            setTables(cacheManager.cacheKeys);
          }
        }
      } catch (e) {
        setStatus('not_initialized');
      }
    };
    
    updateStats();
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, []);
  
  const handleInitialize = async () => {
    setStatus('initializing');
    setError(null);
    try {
      await duckdbService.initialize();
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to initialize');
    }
  };
  
  return (
    <div className={styles.cacheInfo}>
      <p>
        DuckDB WASM: {' '}
        {status === 'ready' && <span className={styles.statusReady}>Ready</span>}
        {status === 'initializing' && <span style={{ color: '#ff9800' }}>Initializing...</span>}
        {status === 'error' && <span style={{ color: '#f44336' }}>Error</span>}
        {status === 'not_initialized' && <span className={styles.statusNotReady}>Not initialized</span>}
      </p>
      
      {status === 'not_initialized' && (
        <div style={{ marginTop: '8px' }}>
          <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
            DuckDB WASM will initialize automatically on first query.
          </p>
          <button 
            onClick={handleInitialize}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              cursor: 'pointer',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Initialize Now
          </button>
        </div>
      )}
      
      {error && (
        <p style={{ fontSize: '11px', color: '#f44336', marginTop: '4px' }}>
          Error: {error}
        </p>
      )}
      
      {status === 'ready' && (
        <>
          {cacheStats && (
            <>
              <p>Cached tables: {cacheStats.tableCount}</p>
              <p>Total rows: {cacheStats.totalRows.toLocaleString()}</p>
            </>
          )}
          {tables.length > 0 ? (
            <details>
              <summary>Table names ({tables.length})</summary>
              <ul className={styles.tableList}>
                {tables.map(t => <li key={t}>{t}</li>)}
              </ul>
            </details>
          ) : (
            <p style={{ fontSize: '11px', color: '#888' }}>
              No data cached yet. Run a query to populate the cache.
            </p>
          )}
        </>
      )}
    </div>
  );
};

const DebugView: React.FC<DebugViewProps> = ({
  debugData
}) => {
  const {
    queryDescription,
    queryResult,
    queryError,
    spec,
    chartInfo,
    renderingError,
    optimizationHints,
  } = debugData;
  const hasError = queryError || renderingError;

  // Custom JSON replacer to handle BigInt values (from Arrow/ClickHouse)
  const bigIntReplacer = (_key: string, value: any): any => {
    if (typeof value === 'bigint') {
      // Convert BigInt to number if within safe range, otherwise to string
      return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
    }
    return value;
  };

  // Safe JSON.stringify that handles BigInt
  const safeStringify = (obj: any, indent: number = 2): string => {
    try {
      return JSON.stringify(obj, bigIntReplacer, indent);
    } catch (e) {
      return `[Error serializing: ${e instanceof Error ? e.message : 'Unknown error'}]`;
    }
  };

  // Create a safe version of queryResult for display to avoid "Invalid string length" errors with large datasets
  const getSafeQueryResult = (result: QueryResult | null) => {
    if (!result) return null;
    
    const rowCount = result.rows?.length || 0;
    const maxRowsToShow = 100; // Limit to first 100 rows
    
    return {
      ...result,
      rows: rowCount > maxRowsToShow 
        ? result.rows.slice(0, maxRowsToShow)
        : result.rows,
      _metadata: {
        totalRows: rowCount,
        displayedRows: Math.min(rowCount, maxRowsToShow),
        truncated: rowCount > maxRowsToShow
      }
    };
  };

  return (
    <div className={styles.container}>
      {/* New Optimization Debug Panel */}
      <div className={styles.panel} style={{ gridColumn: '1 / -1' }}>
        <NewDebugPanel
          queryResult={queryResult}
          requestedHints={optimizationHints || null}
          isLoading={false}
        />
      </div>

      {hasError ? (
        <>
          <div className={styles.panel}>
            <CollapsibleSection title="Query Description (JSON)" defaultExpanded={true}>
              <pre>{safeStringify(queryDescription)}</pre>
            </CollapsibleSection>
            {queryResult?.query_sql && (
              <CollapsibleSection title="Generated SQL" defaultExpanded={true}>
                <pre>{queryResult.query_sql}</pre>
              </CollapsibleSection>
            )}
            {spec && (
              <CollapsibleSection title="Specification">
                <pre>{safeStringify(spec)}</pre>
              </CollapsibleSection>
            )}
            {chartInfo && (
              <CollapsibleSection title="Chart Information">
                <pre>{safeStringify(chartInfo)}</pre>
              </CollapsibleSection>
            )}
            <CollapsibleSection title="Local Cache (DuckDB WASM)">
              <DuckDBCacheInfo />
            </CollapsibleSection>
          </div>
          <div className={styles.panel}>
            {queryError && (
              <CollapsibleSection title="Query Error" defaultExpanded={true}>
                <pre>{queryError}</pre>
              </CollapsibleSection>
            )}
            {renderingError && (
              <CollapsibleSection title="Rendering Error" defaultExpanded={true}>
                <pre className={styles.errorMessage}>{renderingError}</pre>
                <div className={styles.errorHelp}>
                  <p><strong>Debugging Tips:</strong></p>
                  <ul>
                    <li>Check chart type compatibility with field types</li>
                    <li>Verify that continuous fields have valid numerical data</li>
                    <li>Try using a different combination of fields</li>
                  </ul>
                </div>
              </CollapsibleSection>
            )}
          </div>
        </>
      ) : !queryResult ? (
        <div>Drop fields on X/Y axes to build a chart.</div>
      ) : (
        <>
          <div className={styles.panel}>
            <CollapsibleSection title="Query Description (JSON)">
              <pre>{safeStringify(queryDescription)}</pre>
            </CollapsibleSection>
            <CollapsibleSection title="Generated SQL" defaultExpanded={true}>
              <pre>{queryResult.query_sql || 'No SQL available'}</pre>
            </CollapsibleSection>
            {spec && (
              <CollapsibleSection title="Specification">
                <pre>{safeStringify(spec)}</pre>
              </CollapsibleSection>
            )}
            {chartInfo && (
              <CollapsibleSection title="Chart Information">
                <pre>{safeStringify(chartInfo)}</pre>
              </CollapsibleSection>
            )}
            <CollapsibleSection title="Local Cache (DuckDB WASM)">
              <DuckDBCacheInfo />
            </CollapsibleSection>
          </div>
          <div className={styles.panel}>
            <CollapsibleSection title="Result Data">
              <pre>{safeStringify(getSafeQueryResult(queryResult))}</pre>
            </CollapsibleSection>
          </div>
        </>
      )}
    </div>
  );
};

export default DebugView;
