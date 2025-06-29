import React from 'react';
import { QueryDescription, QueryResult } from '../../types';
import styles from './DebugView.module.css';

interface DebugViewProps {
  queryDescription: QueryDescription | null;
  queryResult: QueryResult | null;
  queryError: string | null;
}

const DebugView: React.FC<DebugViewProps> = ({
  queryDescription,
  queryResult,
  queryError,
}) => {
  if (queryError) {
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
        </div>
        <div className={styles.panel}>
          <h3>Error Fetching Data</h3>
          <pre>{queryError}</pre>
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
      </div>
      <div className={styles.panel}>
        <h3>Result</h3>
        <pre>{JSON.stringify(queryResult, null, 2)}</pre>
      </div>
    </div>
  );
};

export default DebugView;
