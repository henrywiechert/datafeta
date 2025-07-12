import React from 'react';
import { QueryDescription, QueryResult } from '../../types';
import { VegaLiteSpec } from '../../spec-generator/types';
import styles from './DebugView.module.css';

export interface DebugData {
  queryDescription: QueryDescription | null;
  queryResult: QueryResult | null;
  queryError: string | null;
  vegaSpec: VegaLiteSpec | null;
  chartInfo?: any;
  renderingError?: string | null;
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
    vegaSpec,
    chartInfo,
    renderingError,
  } = debugData;
  const hasError = queryError || renderingError;

  if (hasError) {
    return (
      <div className={styles.container}>
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
          {vegaSpec && (
            <>
              <hr />
              <h3>Vega-Lite Specification</h3>
              <pre>{JSON.stringify(vegaSpec, null, 2)}</pre>
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
              <pre>{renderingError}</pre>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!queryResult) {
    return <div>Drop fields on X/Y axes to build a chart.</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <h3>Query Description (JSON)</h3>
        <pre>{JSON.stringify(queryDescription, null, 2)}</pre>
        <hr />
        <h3>Generated SQL</h3>
        <pre>{queryResult.query_sql}</pre>
        {vegaSpec && (
          <>
            <hr />
            <h3>Vega-Lite Specification</h3>
            <pre>{JSON.stringify(vegaSpec, null, 2)}</pre>
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
    </div>
  );
};

export default DebugView;
