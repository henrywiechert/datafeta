import React, { useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule, SortChangedEvent } from 'ag-grid-community';
import { Box, Typography } from '@mui/material';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-material.css';

import { TableRowsSortModel } from '../ChartArea/hooks/useTableRowsQuery';
import { QueryResultColumn } from '../../../types';

ModuleRegistry.registerModules([AllCommunityModule]);

interface TableViewRowsProps {
  rows: Record<string, any>[];
  columns: QueryResultColumn[];
  sortModel: TableRowsSortModel | null;
  onSortChanged: (sort: TableRowsSortModel | null) => void;
  loading: boolean;
}

const TableViewRows: React.FC<TableViewRowsProps> = ({ rows, columns, sortModel, onSortChanged, loading }) => {
  const columnDefs: ColDef[] = useMemo(() => {
    return columns.map((col) => ({
      field: col.name,
      headerName: col.name,
      sortable: true,
      resizable: true,
      minWidth: 80,
      // Handle field names with dots (AG Grid interprets as nested paths)
      valueGetter: (params: any) => params.data?.[col.name],
      valueFormatter: (params: any) => {
        if (params.value === null || params.value === undefined) return '';
        if (typeof params.value === 'number') return params.value.toLocaleString();
        if (params.value instanceof Date) return params.value.toLocaleString();
        return String(params.value);
      },
    }));
  }, [columns]);

  const handleSortChanged = useCallback(
    (event: SortChangedEvent) => {
      const colState = event.api.getColumnState();
      const sorted = colState.find((c) => c.sort);
      if (sorted && sorted.colId) {
        onSortChanged({ field: sorted.colId, direction: sorted.sort as 'asc' | 'desc' });
      } else {
        onSortChanged(null);
      }
    },
    [onSortChanged],
  );

  if (columns.length === 0 && !loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Add fields to axes or encoding channels to view data.
        </Typography>
      </Box>
    );
  }

  return (
    <div className="ag-theme-material" style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          resizable: true,
          minWidth: 80,
          cellStyle: { textAlign: 'left' as const },
          valueFormatter: (params: any) =>
            params.value === null || params.value === undefined ? '' : String(params.value),
        }}
        pagination={false}
        animateRows={false}
        rowSelection="multiple"
        suppressRowClickSelection={true}
        domLayout="normal"
        loading={loading}
        onGridReady={(params) => {
          params.api.sizeColumnsToFit();
        }}
        onSortChanged={handleSortChanged}
        suppressHorizontalScroll={false}
      />
    </div>
  );
};

export default TableViewRows;
