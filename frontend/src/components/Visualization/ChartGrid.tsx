import React, { useMemo } from 'react';
import { GridSpec } from '../../spec-generator/specGenerator';
import ChartCell from './ChartCell';
import styles from './ChartGrid.module.css';
import { QueryResult, Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

interface ChartGridProps {
  gridSpec: GridSpec;
  queryResult: QueryResult | null;
}

/**
 * Extracts the unique values for a given facet field from the query result.
 */
const getUniqueFacetValues = (field: Field, queryResult: QueryResult): (string | number)[] => {
  const columnName = getResultColumnName(field);
  const columnIndex = queryResult.columns.indexOf(columnName);

  if (columnIndex === -1) {
    return [];
  }

  const values = queryResult.rows.map(row => row[columnIndex]);
  return Array.from(new Set(values)).filter(v => v !== null) as (string|number)[];
};

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

  const { colFacetValues, rowFacetValues } = useMemo(() => {
    if (!queryResult) return { colFacetValues: [], rowFacetValues: [] };

    const colFacetValues = facets.columns.flatMap(field =>
      getUniqueFacetValues(field, queryResult)
    );
    const rowFacetValues = facets.rows.flatMap(field =>
      getUniqueFacetValues(field, queryResult)
    );
    return { colFacetValues, rowFacetValues };
  }, [queryResult, facets]);

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
      {(rowFacetValues.length > 0 ? rowFacetValues : [null]).map((rowVal, rowIndex) =>
        (colFacetValues.length > 0 ? colFacetValues : [null]).map((colVal, colIndex) => {
          
          // TODO: This slicing logic is simplified. It assumes one facet field per axis.
          // A full implementation would need to handle multiple/nested facets.
          const rowFacetField = facets.rows[0];
          const colFacetField = facets.columns[0];
          
          const slicedData = queryResult?.rows.filter(row => {
            let match = true;
            if (rowVal && rowFacetField) {
              const rowColName = getResultColumnName(rowFacetField);
              const rowColIndex = queryResult.columns.indexOf(rowColName);
              match = match && row[rowColIndex] === rowVal;
            }
            if (colVal && colFacetField) {
              const colColName = getResultColumnName(colFacetField);
              const colColIndex = queryResult.columns.indexOf(colColName);
              match = match && row[colColIndex] === colVal;
            }
            return match;
          }) || [];
          
          return (
            <div key={`${rowIndex}-${colIndex}`} className={styles.cellContainer}>
              {/* We will add facet headers here later */}
              <ChartCell cellSpec={cell} data={slicedData} />
            </div>
          )
        })
      )}
    </div>
  );
};

export default ChartGrid;
