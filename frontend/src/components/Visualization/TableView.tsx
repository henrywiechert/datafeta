import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { Box, Typography } from '@mui/material';

// Import AG Grid CSS
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-material.css';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface Column {
  field: string;
  headerName: string;
  width?: number;
  pinned?: 'left' | 'right';
  cellStyle?: { textAlign: 'left' | 'center' | 'right' };
}

interface TableViewProps {
  columns: Column[];
  rows: any[];
  xFields: any[];
  yFields: any[];
}

const TableView: React.FC<TableViewProps> = ({ columns, rows, xFields, yFields }) => {
  // Convert columns to AG Grid format
  const columnDefs: ColDef[] = useMemo(() => {
    return columns.map((col) => ({
      field: col.field,
      headerName: col.headerName,
      width: col.width || 120,
      sortable: true,
      filter: 'agTextColumnFilter' as any,
      resizable: true,
      pinned: col.pinned || undefined,
      cellStyle: col.cellStyle || { textAlign: 'left' as const },
      valueFormatter: (params: any) => (params.value === null || params.value === undefined) ? '' : String(params.value),
    }));
  }, [columns]);

  // Determine layout type for potential future customization
  const layoutType = useMemo(() => {
    const hasXFields = xFields.length > 0;
    const hasYFields = yFields.length > 0;
    
    if (hasXFields && hasYFields) return 'grid';
    if (hasYFields) return 'vertical';
    if (hasXFields) return 'horizontal';
    return 'empty';
  }, [xFields.length, yFields.length]);

  if (columns.length === 0) {
    return (
      <Box 
        sx={{ 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <Typography variant="body1" color="text.secondary">
          Drag discrete dimensions to the axes to create a table view.
        </Typography>
      </Box>
    );
  }

  // Determine if pagination should be enabled
  const shouldPaginate = rows.length > 1000;

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <div className="ag-theme-material" style={{ height: '100%', width: '100%' }}>
        <AgGridReact
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            filter: 'agTextColumnFilter' as any,
            resizable: true,
            minWidth: layoutType === 'grid' ? 60 : 80,
            cellStyle: { textAlign: 'left' as const },
            valueFormatter: (params: any) => (params.value === null || params.value === undefined) ? '' : String(params.value),
          }}
          pagination={shouldPaginate}
          paginationPageSize={shouldPaginate ? 25 : undefined}
          paginationPageSizeSelector={shouldPaginate ? [25, 50, 100] : undefined}
          animateRows={true}
          rowSelection="multiple"
          suppressRowClickSelection={true}
          domLayout="normal"
          onGridReady={(params) => {
            params.api.sizeColumnsToFit();
          }}
          // Grid-specific configurations
          suppressHorizontalScroll={false}
          suppressColumnVirtualisation={layoutType === 'grid'}
        />
      </div>
    </Box>
  );
};

export default TableView; 