import React, { useState, useEffect } from 'react';
import { QueryDescription, QueryResult, OptimizationHints } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import styles from './DebugView.module.css';
import { DebugPanel as NewDebugPanel } from '../DebugPanel';
import { duckdbService, QueryLogEntry } from '../../services/duckdbService';
import { cacheManager, CacheStats, CachedTableInfo } from '../../services/cacheManager';
import { columnCacheManager, CachedColumnInfo } from '../../services/columnCacheManager';
import { filterTierManager } from '../../services/filterTierManager';
import { queryDecisionEngine, QueryDecision } from '../../services/queryDecisionEngine';

export interface DebugData {
  queryDescription: QueryDescription | null;
  queryResult: QueryResult | null;
  queryError: string | null;
  spec: PlotResult | null;
  chartInfo?: any;
  renderingError?: string | null;
  optimizationHints?: OptimizationHints | null;
  /** Last query decision from the decision engine */
  lastQueryDecision?: QueryDecision | null;
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
  const [tableInfo, setTableInfo] = useState<CachedTableInfo[]>([]);
  const [queryLog, setQueryLog] = useState<QueryLogEntry[]>([]);
  const [status, setStatus] = useState<'not_initialized' | 'initializing' | 'ready' | 'error'>('not_initialized');
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ sql: string; rows: any[]; columns: string[] } | null>(null);
  
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
            setTableInfo(cacheManager.getAllTableInfo());
            setQueryLog(duckdbService.queryLog);
          }
        }
      } catch (e) {
        setStatus('not_initialized');
      }
    };
    
    updateStats();
    const interval = setInterval(updateStats, 1000); // Update more frequently for query log
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

  const handleClearLog = () => {
    duckdbService.clearQueryLog();
    setQueryLog([]);
  };

  const handleTestQuery = async () => {
    if (!duckdbService.isReady) return;
    
    const tables = cacheManager.cacheKeys;
    if (tables.length === 0) {
      alert('No cached tables. Run a backend query first to cache data.');
      return;
    }
    
    const tableName = tables[0];
    const sql = `SELECT COUNT(*) as total_rows FROM "${tableName}"`;
    try {
      const result = await duckdbService.query(sql);
      setLastResult({ sql, rows: result.rows, columns: result.columns });
      setQueryLog(duckdbService.queryLog);
    } catch (e) {
      console.error('Test query failed:', e);
      setLastResult({ sql, rows: [], columns: ['error'] });
    }
  };

  const handleTestDistinct = async () => {
    if (!duckdbService.isReady) return;
    
    const tables = cacheManager.getAllTableInfo();
    if (tables.length === 0) {
      alert('No cached tables. Run a backend query first to cache data.');
      return;
    }
    
    const table = tables[0];
    const cols = table.columns.slice(0, 2);
    if (cols.length < 2) {
      alert('Need at least 2 columns for DISTINCT test.');
      return;
    }
    
    // Show distinct values with counts to understand distribution
    const sql = `SELECT "${cols[0]}", "${cols[1]}", COUNT(*) as count 
                 FROM "${table.name}" 
                 GROUP BY "${cols[0]}", "${cols[1]}" 
                 ORDER BY count DESC 
                 LIMIT 20`;
    try {
      const result = await duckdbService.query(sql);
      setLastResult({ sql, rows: result.rows, columns: result.columns });
      setQueryLog(duckdbService.queryLog);
    } catch (e) {
      console.error('DISTINCT test failed:', e);
      setLastResult({ sql, rows: [], columns: ['error'] });
    }
  };

  const handleShowSample = async () => {
    if (!duckdbService.isReady) return;
    
    const tables = cacheManager.getAllTableInfo();
    if (tables.length === 0) {
      alert('No cached tables. Run a backend query first to cache data.');
      return;
    }
    
    const table = tables[0];
    const cols = table.columns.slice(0, 2);
    
    // Combined stats query
    const sql = cols.length >= 2 
      ? `SELECT 
           COUNT(*) as total_rows,
           COUNT(DISTINCT ("${cols[0]}", "${cols[1]}")) as distinct_pairs,
           MIN("${cols[0]}") as "${cols[0]}_min", 
           MAX("${cols[0]}") as "${cols[0]}_max",
           MIN("${cols[1]}") as "${cols[1]}_min", 
           MAX("${cols[1]}") as "${cols[1]}_max"
         FROM "${table.name}"`
      : `SELECT COUNT(*) as total_rows FROM "${table.name}"`;
    
    try {
      const result = await duckdbService.query(sql);
      setLastResult({ sql, rows: result.rows, columns: result.columns });
      setQueryLog(duckdbService.queryLog);
    } catch (e) {
      console.error('Stats query failed:', e);
      setLastResult({ sql, rows: [], columns: ['error'] });
    }
  };

  const handleShowRawSample = async () => {
    if (!duckdbService.isReady) return;
    
    const tables = cacheManager.getAllTableInfo();
    if (tables.length === 0) {
      alert('No cached tables. Run a backend query first to cache data.');
      return;
    }
    
    const table = tables[0];
    // Use random sampling to get representative data
    const sql = `SELECT * FROM "${table.name}" USING SAMPLE 10 ROWS`;
    
    try {
      const result = await duckdbService.query(sql);
      // Also log with typeof for each value to debug type issues
      console.log('🔍 Random sample with types:', result.rows.map(row => {
        const typed: Record<string, string> = {};
        for (const col of result.columns) {
          typed[col] = `${row[col]} (${typeof row[col]})`;
        }
        return typed;
      }));
      setLastResult({ sql, rows: result.rows, columns: result.columns });
      setQueryLog(duckdbService.queryLog);
    } catch (e) {
      // Fallback if USING SAMPLE not supported
      console.warn('Random sample failed, trying ORDER BY RANDOM():', e);
      try {
        const fallbackSql = `SELECT * FROM "${table.name}" ORDER BY RANDOM() LIMIT 10`;
        const result = await duckdbService.query(fallbackSql);
        setLastResult({ sql: fallbackSql, rows: result.rows, columns: result.columns });
        setQueryLog(duckdbService.queryLog);
      } catch (e2) {
        console.error('Sample query failed:', e2);
        setLastResult({ sql, rows: [], columns: ['error'] });
      }
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
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
          
          {/* Cached Tables with Column Info */}
          {tableInfo.length > 0 ? (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
                📊 Cached Tables ({tableInfo.length})
              </summary>
              <div style={{ marginLeft: '12px', marginTop: '8px' }}>
                {tableInfo.map(table => (
                  <details key={table.name} style={{ marginBottom: '8px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '12px' }}>
                      <strong>{table.name}</strong>
                      <span style={{ color: '#666', marginLeft: '8px' }}>
                        ({table.rowCount.toLocaleString()} rows, {table.columns.length} cols)
                      </span>
                    </summary>
                    <div style={{ 
                      marginLeft: '16px', 
                      marginTop: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      backgroundColor: '#f5f5f5',
                      padding: '6px',
                      borderRadius: '4px'
                    }}>
                      <div style={{ color: '#666', marginBottom: '4px' }}>
                        Source: {table.sourceDatabase ? `${table.sourceDatabase}.` : ''}{table.sourceTable}
                      </div>
                      <div style={{ color: '#666', marginBottom: '4px' }}>
                        Cached: {table.cachedAt.toLocaleTimeString()}
                      </div>
                      <div>
                        <strong>Columns:</strong>
                        <div style={{ 
                          display: 'flex', 
                          flexWrap: 'wrap', 
                          gap: '4px',
                          marginTop: '4px'
                        }}>
                          {table.columns.map(col => (
                            <span 
                              key={col}
                              style={{
                                backgroundColor: '#e3f2fd',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '10px'
                              }}
                            >
                              {col}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ) : (
            <p style={{ fontSize: '11px', color: '#888' }}>
              No data cached yet. Run a query to populate the cache.
            </p>
          )}

          {/* Test Query Buttons */}
          {tableInfo.length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleTestQuery}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: '#e3f2fd',
                  border: '1px solid #90caf9',
                  borderRadius: '4px',
                }}
              >
                🧪 COUNT(*)
              </button>
              <button
                onClick={handleTestDistinct}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: '#e8f5e9',
                  border: '1px solid #a5d6a7',
                  borderRadius: '4px',
                }}
              >
                🧪 DISTINCT
              </button>
              <button
                onClick={handleShowSample}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: '#fff3e0',
                  border: '1px solid #ffcc80',
                  borderRadius: '4px',
                }}
              >
                🔬 Stats
              </button>
              <button
                onClick={handleShowRawSample}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: '#fce4ec',
                  border: '1px solid #f48fb1',
                  borderRadius: '4px',
                }}
              >
                📋 Sample Rows
              </button>
            </div>
          )}

          {/* Query Result Display */}
          {lastResult && (
            <div style={{ 
              marginTop: '12px', 
              padding: '8px', 
              backgroundColor: '#fafafa', 
              borderRadius: '4px',
              border: '1px solid #e0e0e0'
            }}>
              <div style={{ 
                fontSize: '10px', 
                fontFamily: 'monospace', 
                color: '#666',
                marginBottom: '8px',
                wordBreak: 'break-all'
              }}>
                {lastResult.sql}
              </div>
              <table style={{ 
                width: '100%', 
                fontSize: '11px', 
                borderCollapse: 'collapse',
                fontFamily: 'monospace'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#e3f2fd' }}>
                    {lastResult.columns.map(col => (
                      <th key={col} style={{ 
                        padding: '4px 8px', 
                        textAlign: 'left',
                        borderBottom: '1px solid #90caf9'
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lastResult.rows.map((row, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                      {lastResult.columns.map(col => (
                        <td key={col} style={{ 
                          padding: '4px 8px',
                          borderBottom: '1px solid #eee'
                        }}>
                          {typeof row[col] === 'number' 
                            ? row[col].toLocaleString(undefined, { maximumFractionDigits: 6 })
                            : String(row[col] ?? 'null')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => setLastResult(null)}
                style={{
                  marginTop: '8px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  backgroundColor: '#eee',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                }}
              >
                Clear Result
              </button>
            </div>
          )}

          {/* Local Query Log */}
          <details style={{ marginTop: '12px' }} open={queryLog.length > 0}>
            <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
              🔍 Local Queries ({queryLog.length})
              {queryLog.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleClearLog(); }}
                  style={{
                    marginLeft: '8px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    backgroundColor: '#eee',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                  }}
                >
                  Clear
                </button>
              )}
            </summary>
            <div style={{ marginTop: '8px', maxHeight: '300px', overflow: 'auto' }}>
              {queryLog.length === 0 ? (
                <p style={{ fontSize: '11px', color: '#888', margin: '4px 0' }}>
                  No local queries executed yet.
                </p>
              ) : (
                queryLog.map((entry, idx) => (
                  <div 
                    key={idx}
                    style={{
                      marginBottom: '8px',
                      padding: '8px',
                      backgroundColor: entry.error ? '#ffebee' : '#f5f5f5',
                      borderRadius: '4px',
                      borderLeft: entry.error ? '3px solid #f44336' : '3px solid #4caf50',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                      color: '#666'
                    }}>
                      <span>{formatTime(entry.timestamp)}</span>
                      <span>
                        {entry.durationMs}ms • {entry.rowCount.toLocaleString()} rows
                      </span>
                    </div>
                    <pre style={{ 
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      maxHeight: '80px',
                      overflow: 'auto'
                    }}>
                      {entry.sql}
                    </pre>
                    {entry.error && (
                      <div style={{ color: '#f44336', marginTop: '4px' }}>
                        Error: {entry.error}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
};

/** Cache Strategy & Filter Tiers Info component */
const CacheStrategyInfo: React.FC<{ lastQueryDecision?: QueryDecision | null }> = ({ lastQueryDecision }) => {
  const [filterTierStats, setFilterTierStats] = useState<{
    baseFilterColumnCount: number;
    baseFilterColumns: string[];
    currentBaseFilterHash: string;
    storedBaseFilterCount: number;
  } | null>(null);
  
  const [decisionEngineStats, setDecisionEngineStats] = useState<{
    sizeThreshold: number;
    rowCountCacheSize: number;
  } | null>(null);
  
  const [columnCacheInfo, setColumnCacheInfo] = useState<Array<{
    cacheKey: string;
    tableName: string;
    columns: CachedColumnInfo[];
  }>>([]);
  
  useEffect(() => {
    const updateStats = () => {
      try {
        setFilterTierStats(filterTierManager.getStats());
        setDecisionEngineStats(queryDecisionEngine.getStats());
        setColumnCacheInfo(columnCacheManager.getAllCacheInfo());
      } catch (e) {
        console.warn('Failed to update cache strategy stats:', e);
      }
    };
    
    updateStats();
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div style={{ fontSize: '12px', padding: '8px' }}>
      {/* Query Decision */}
      <details open={!!lastQueryDecision}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
          🧠 Last Query Decision
        </summary>
        {lastQueryDecision ? (
          <div style={{ 
            padding: '8px', 
            backgroundColor: lastQueryDecision.strategy === 'cache_hit' ? '#e8f5e9' : 
                            lastQueryDecision.strategy === 'raw_columns' ? '#e3f2fd' : '#fff3e0',
            borderRadius: '4px',
            marginBottom: '12px'
          }}>
            <div style={{ fontWeight: 500 }}>
              Strategy: <span style={{ 
                color: lastQueryDecision.strategy === 'cache_hit' ? '#2e7d32' : 
                       lastQueryDecision.strategy === 'raw_columns' ? '#1565c0' : '#ef6c00'
              }}>
                {lastQueryDecision.strategy.toUpperCase().replace('_', ' ')}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              {lastQueryDecision.reason}
            </div>
            {lastQueryDecision.estimatedRowCount && (
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                Estimated rows: {lastQueryDecision.estimatedRowCount.toLocaleString()}
              </div>
            )}
            {lastQueryDecision.columnsToFetch && lastQueryDecision.columnsToFetch.length > 0 && (
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                Columns to fetch: {lastQueryDecision.columnsToFetch.join(', ')}
              </div>
            )}
            {lastQueryDecision.cachedColumns && lastQueryDecision.cachedColumns.length > 0 && (
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                Cached columns: {lastQueryDecision.cachedColumns.join(', ')}
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: '#999', fontSize: '11px' }}>No query decision yet.</p>
        )}
      </details>
      
      {/* Filter Tiers */}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
          🔐 Filter Tiers
        </summary>
        {filterTierStats && (
          <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '12px' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>Base Filter Hash:</strong>{' '}
              <code style={{ backgroundColor: '#e0e0e0', padding: '2px 4px', borderRadius: '2px' }}>
                {filterTierStats.currentBaseFilterHash || '(none)'}
              </code>
            </div>
            {filterTierStats.baseFilterColumns.length > 0 ? (
              <div>
                <strong>Base Filter Columns ({filterTierStats.baseFilterColumnCount}):</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {filterTierStats.baseFilterColumns.map(col => (
                    <span key={col} style={{
                      backgroundColor: '#bbdefb',
                      color: '#0d47a1',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '10px'
                    }}>
                      🔒 {col}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '11px', color: '#999' }}>
                All filters are base filters by default. Toggle the lock icon on filter chips to mark as refinement.
              </p>
            )}
          </div>
        )}
      </details>
      
      {/* Decision Engine Config */}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
          ⚙️ Decision Engine Config
        </summary>
        {decisionEngineStats && (
          <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '12px' }}>
            <div>
              <strong>Size Threshold:</strong>{' '}
              {decisionEngineStats.sizeThreshold.toLocaleString()} rows
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              Below threshold → fetch raw columns | Above → pre-aggregate
            </div>
            <div style={{ marginTop: '8px' }}>
              <strong>Row Count Cache:</strong> {decisionEngineStats.rowCountCacheSize} entries
            </div>
          </div>
        )}
      </details>
      
      {/* Column Cache Details */}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
          📊 Column Cache ({columnCacheInfo.length} tables)
        </summary>
        {columnCacheInfo.length > 0 ? (
          <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            {columnCacheInfo.map(cache => (
              <div key={cache.cacheKey} style={{ 
                marginBottom: '8px', 
                padding: '6px', 
                backgroundColor: '#fff',
                borderRadius: '4px',
                border: '1px solid #e0e0e0'
              }}>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                  {cache.tableName}
                </div>
                <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                  Key: {cache.cacheKey}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {cache.columns.map(col => (
                    <span key={col.columnName} style={{
                      backgroundColor: '#e8f5e9',
                      color: '#2e7d32',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '10px'
                    }}>
                      {col.columnName} <span style={{ color: '#999' }}>({col.dataType})</span>
                    </span>
                  ))}
                </div>
                {cache.columns.length > 0 && (
                  <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                    {cache.columns[0].rowCount.toLocaleString()} rows • 
                    Cached: {cache.columns[0].cachedAt.toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '11px', color: '#999', padding: '8px' }}>
            No column-level cache data. Run a query to populate the cache.
          </p>
        )}
      </details>
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
    lastQueryDecision,
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
            <CollapsibleSection title="Cache Strategy & Filter Tiers">
              <CacheStrategyInfo lastQueryDecision={lastQueryDecision} />
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
            <CollapsibleSection title="Cache Strategy & Filter Tiers">
              <CacheStrategyInfo lastQueryDecision={lastQueryDecision} />
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
