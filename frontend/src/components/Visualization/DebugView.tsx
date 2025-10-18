import React from 'react';
import { QueryDescription, QueryResult, OptimizationHints } from '../../types';
import { PlotResult } from '../../observable-plot-generator/types';
import styles from './DebugView.module.css';
import { DebugPanel as NewDebugPanel } from '../DebugPanel';

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
            <h3>Query Description (JSON)</h3>
            <pre>{JSON.stringify(queryDescription, null, 2)}</pre>
            {queryResult?.query_sql && (
              <>
                <hr />
                <h3>Generated SQL</h3>
                <pre>{queryResult.query_sql}</pre>
              </>
            )}
            {spec && (
              <>
                <hr />
                <h3>Specification</h3>
                <pre>{JSON.stringify(spec, null, 2)}</pre>
              </>
            )}
            {chartInfo && (
              <>
                <hr />
                <h3>Chart Information</h3>
                <pre>{JSON.stringify(chartInfo, null, 2)}</pre>
              </>
            )}
          </div>
          <div className={styles.panel}>
            {queryError && (
              <>
                <h3>Query Error</h3>
                <pre>{queryError}</pre>
              </>
            )}
            {renderingError && (
              <>
                {queryError && <hr />}
                <h3>Rendering Error</h3>
                <pre className={styles.errorMessage}>{renderingError}</pre>
                <div className={styles.errorHelp}>
                  <p><strong>Debugging Tips:</strong></p>
                  <ul>
                    <li>Check chart type compatibility with field types</li>
                    <li>Verify that continuous fields have valid numerical data</li>
                    <li>Try using a different combination of fields</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </>
      ) : !queryResult ? (
        <div>Drop fields on X/Y axes to build a chart.</div>
      ) : (
        <>
          <div className={styles.panel}>
            <h3>Query Description (JSON)</h3>
            <pre>{JSON.stringify(queryDescription, null, 2)}</pre>
            <hr />
            <h3>Generated SQL</h3>
            <pre>{queryResult.query_sql}</pre>
            {spec && (
              <>
                <hr />
                <h3>Specification</h3>
                <pre>{JSON.stringify(spec, null, 2)}</pre>
              </>
            )}
            {chartInfo && (
              <>
                <hr />
                <h3>Chart Information</h3>
                <pre>{JSON.stringify(chartInfo, null, 2)}</pre>
              </>
            )}
          </div>
          <div className={styles.panel}>
            <h3>Result</h3>
            <pre>{JSON.stringify(queryResult, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  );
};

export default DebugView;
