/**
 * useTableRowsQuery Hook
 *
 * Manages server-side paginated queries for the TableViewRows feature.
 * Fetches raw (ungrouped, unaggregated) rows with limit/offset pagination
 * and server-side sorting via the /query-arrow endpoint.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Field, QueryDescription, OrderBy, FilterConfig, QueryResultColumn } from '../../../../types';
import { VirtualTableDefinition, VirtualColumnDefinition } from '../../../../types';
import { queryApi } from '../../../../services/api/queryApi';
import { metadataApi } from '../../../../services/api/metadataApi';
import { convertFilterConfigsToFilters, extractColumnCasts } from '../../../../queryBuilder/queryBuilder';
import { getResultColumnName } from '../../../../utils/fieldUtils';

export interface TableRowsSortModel {
  field: string;
  direction: 'asc' | 'desc';
}

export interface UseTableRowsQueryProps {
  enabled: boolean;
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField: Field | null;
  labelFields: Field[];
  tooltipFields: Field[];
  filterConfigurations: Record<string, FilterConfig>;
  virtualTable?: VirtualTableDefinition | null;
  virtualColumns?: VirtualColumnDefinition[];
}

export interface UseTableRowsQueryReturn {
  rows: Record<string, any>[];
  columns: QueryResultColumn[];
  totalRows: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  sortModel: TableRowsSortModel | null;
  setSortModel: (sort: TableRowsSortModel | null) => void;
  loading: boolean;
  error: string | null;
}

/**
 * Collect all active fields from every encoding channel, deduplicated by columnName.
 */
function collectAllFields(
  xAxisFields: Field[],
  yAxisFields: Field[],
  colorField: Field | null,
  sizeField: Field | null,
  labelFields: Field[],
  tooltipFields: Field[],
): Field[] {
  const seen = new Set<string>();
  const result: Field[] = [];

  const add = (f: Field) => {
    const key = getResultColumnName(f);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  };

  xAxisFields.forEach(add);
  yAxisFields.forEach(add);
  if (colorField) add(colorField);
  if (sizeField) add(sizeField);
  labelFields.forEach(add);
  tooltipFields.forEach(add);

  return result;
}

export function useTableRowsQuery({
  enabled,
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField,
  labelFields,
  tooltipFields,
  filterConfigurations,
  virtualTable,
  virtualColumns,
}: UseTableRowsQueryProps): UseTableRowsQueryReturn {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<QueryResultColumn[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPageInternal] = useState(0);
  const [pageSize, setPageSizeInternal] = useState(50);
  const [sortModel, setSortModel] = useState<TableRowsSortModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Collect all active fields
  const allFields = useMemo(
    () => collectAllFields(xAxisFields, yAxisFields, colorField, sizeField, labelFields, tooltipFields),
    [xAxisFields, yAxisFields, colorField, sizeField, labelFields, tooltipFields],
  );

  // Stable key for filter configs to detect changes
  const filterKey = useMemo(() => JSON.stringify(filterConfigurations), [filterConfigurations]);

  // Reset page when fields or filters change
  useEffect(() => {
    setPageInternal(0);
  }, [allFields, filterKey]);

  const setPage = useCallback((p: number) => setPageInternal(p), []);
  const setPageSize = useCallback((size: number) => {
    setPageSizeInternal(size);
    setPageInternal(0);
  }, []);

  // Fetch total row count
  useEffect(() => {
    if (!enabled || !selectedTable || allFields.length === 0) {
      setTotalRows(0);
      return;
    }

    const controller = new AbortController();

    metadataApi.getRowCount(
      selectedTable,
      selectedDatabase ?? undefined,
      filterConfigurations,
      virtualColumns,
      virtualTable ?? undefined,
      controller.signal,
    )
      .then((count) => setTotalRows(count))
      .catch((err) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.warn('TableRows: row count failed', err);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedTable, selectedDatabase, filterKey, virtualTable, virtualColumns]);

  // Fetch page data
  useEffect(() => {
    if (!enabled || !selectedTable || allFields.length === 0) {
      setRows([]);
      setColumns([]);
      setError(null);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const dimensions = allFields.map((f) => ({
      field: f.columnName,
      flavour: f.flavour,
      axis: f.axis,
      date_part: f.dateTimePart,
      date_mode: f.dateTimeMode,
    }));

    const filters = convertFilterConfigsToFilters(filterConfigurations);
    const columnCasts = extractColumnCasts(allFields);

    const orderBy: OrderBy[] = sortModel
      ? [{ field: sortModel.field, direction: sortModel.direction }]
      : [];

    const queryDesc: QueryDescription = {
      target_table: selectedTable,
      target_database: selectedDatabase ?? undefined,
      dimensions,
      measures: [],
      filters: filters.length > 0 ? filters : undefined,
      orderBy: orderBy.length > 0 ? orderBy : undefined,
      limit: pageSize,
      offset: page * pageSize,
      column_casts: columnCasts,
      force_raw_rows: true,
      virtual_table: virtualTable ?? undefined,
      virtual_columns: virtualColumns && virtualColumns.length > 0 ? virtualColumns : undefined,
    };

    setLoading(true);
    setError(null);

    queryApi
      .executeQueryArrow(queryDesc, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.rows);
          setColumns(result.columns);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedTable, selectedDatabase, allFields, filterKey, page, pageSize, sortModel, virtualTable, virtualColumns]);

  // Stabilize the return object to prevent new reference every render
  return useMemo(() => ({
    rows,
    columns,
    totalRows,
    page,
    pageSize,
    setPage,
    setPageSize,
    sortModel,
    setSortModel,
    loading,
    error,
  }), [rows, columns, totalRows, page, pageSize, setPage, setPageSize, sortModel, setSortModel, loading, error]);
}
