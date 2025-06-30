import React from 'react';
import { GridSpec } from '../../spec-generator/specGenerator';
import ChartCell from './ChartCell';
import styles from './ChartGrid.module.css';
import { QueryResult } from '../../types';

interface ChartGridProps {
  gridSpec: GridSpec;
  queryResult: QueryResult | null;
}

const ChartGrid: React.FC<ChartGridProps> = ({ gridSpec, queryResult }) => {
  const { cell, facets, errors } = gridSpec;

  if (errors) {
    return (
      <div className={styles.errorContainer}>
        <h2>{errors[0].title}</h2>
        <p>{errors[0].message}</p>
      </div>
    );
  }

  // MOCK DATA: In the future, we will get unique values for facet fields from the backend
  const colFacetValues = facets.columns.map(f => [`${f.columnName}=A`, `${f.columnName}=B`]).flat();
  const rowFacetValues = facets.rows.map(f => [`${f.columnName}=X`, `${f.columnName}=Y`]).flat();

  const hasRowFacets = rowFacetValues.length > 0;
  const hasColFacets = colFacetValues.length > 0;

  // If there are no fields, don't render anything
  if (cell.encoding.x === undefined && cell.encoding.y === undefined && facets.columns.length === 0 && facets.rows.length === 0) {
    return <div className={styles.container}></div>;
  }

  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, colFacetValues.length)}, 1fr)`,
        gridTemplateRows: `repeat(${Math.max(1, rowFacetValues.length)}, 1fr)`,
      }}
    >
      {/* This is a simplified rendering loop. A real implementation would need to
          handle nested headers and pass sliced data to each cell. */}
      
      {(rowFacetValues.length > 0 ? rowFacetValues : [null]).map((rowVal, rowIndex) =>
        (colFacetValues.length > 0 ? colFacetValues : [null]).map((colVal, colIndex) => (
          <div key={`${rowIndex}-${colIndex}`} className={styles.cellContainer}>
             {/* We will add facet headers here later */}
            <ChartCell cellSpec={cell} />
          </div>
        ))
      )}
    </div>
  );
};

export default ChartGrid;
