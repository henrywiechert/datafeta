import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule, ICellRendererParams } from 'ag-grid-community';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

// Import AG Grid CSS
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-material.css';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Styled container for hierarchical table with custom CSS
const HierarchicalTableContainer = styled('div')(({ theme }) => ({
  height: '100%',
  width: '100%',
  '& .ag-theme-material': {
    '& .hierarchical-group-cell': {
      backgroundColor: 'rgba(25, 118, 210, 0.04)',
      borderRight: `2px solid ${theme.palette.primary.main}`,
      fontWeight: 600,
    },
    '& .hierarchical-hidden-cell': {
      display: 'none !important',
      border: 'none !important',
      padding: 0,
    },
    // Add subtle borders for better grouping visualization
    '& .ag-row': {
      '&:hover .hierarchical-group-cell': {
        backgroundColor: 'rgba(25, 118, 210, 0.08)',
      }
    },
    // When a row is a continuation of a row-spanned group, remove horizontal separators
    '& .ag-row.ag-row-span-continued': {
      borderTop: 'none !important',
      borderBottom: 'none !important',
    },
    // Remove focus ring on grouped cells so merged areas don't show inner frames
    '& .ag-cell.hierarchical-group-cell.ag-cell-focus': {
      outline: 'none !important',
      borderColor: 'transparent !important',
    }
  }
}));

interface Column {
  field: string;
  headerName: string;
  width?: number;
  pinned?: 'left' | 'right';
  cellStyle?: { textAlign: 'left' | 'center' | 'right' };
  rowSpan?: (params: any) => number;
  cellRenderer?: string;
  cellClassRules?: any;
  comparator?: (valueA: any, valueB: any, nodeA: any, nodeB: any, isDescending: boolean) => number;
}

// Custom cell renderer for hierarchical grouping
const HierarchicalCellRenderer = (params: ICellRendererParams) => {
  if (!params.colDef?.field) {
    return params.value || '';
  }
  
  const fieldName = params.colDef.field;
  const isHidden = params.data[`${fieldName}_hidden`];
  
  if (isHidden) {
    return '';
  }
  
  const value = params.value;
  const rowSpan = params.data[`${fieldName}_rowSpan`] || 1;
  
  return (
    <div 
      style={{ 
        height: '100%',
        display: 'flex', 
        alignItems: 'center',
        fontWeight: rowSpan > 1 ? 'bold' : 'normal',
        backgroundColor: rowSpan > 1 ? 'rgba(0, 0, 0, 0.02)' : 'transparent'
      }}
    >
      {value}
    </div>
  );
};

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
      // Use valueGetter to handle field names with dots (which AG Grid interprets as nested paths)
      valueGetter: (params: any) => params.data?.[col.field],
      valueFormatter: (params: any) => (params.value === null || params.value === undefined) ? '' : String(params.value),
      // Add row spanning support
      rowSpan: col.rowSpan,
      cellRenderer: col.cellRenderer === 'agGroupCellRenderer' ? HierarchicalCellRenderer : undefined,
      cellClassRules: col.cellClassRules || {},
      // Add hierarchical sorting support
      comparator: col.comparator,
    }));
  }, [columns]);

  // Fields that participate in hierarchical grouping (have rowSpan)
  const groupingFieldNames = useMemo(() => {
    return columns
      .filter((c) => typeof c.rowSpan === 'function')
      .map((c) => c.field);
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
    <HierarchicalTableContainer>
      <div className="ag-theme-material" style={{ height: '100%', width: '100%' }}>
        <AgGridReact
          rowData={rows}
          columnDefs={columnDefs}
          rowClassRules={{
            'ag-row-span-continued': (params: any) =>
              groupingFieldNames.some((f) => params.data?.[`${f}_hidden`] === true),
          }}
          defaultColDef={{
            sortable: true,
            filter: 'agTextColumnFilter' as any,
            resizable: true,
            minWidth: layoutType === 'grid' ? 60 : 80,
            cellStyle: { textAlign: 'left' as const },
            // Note: valueGetter is set per-column to handle field names with dots
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
          // Enable row spanning for hierarchical grouping
          suppressRowTransform={true}
        />
      </div>
    </HierarchicalTableContainer>
  );
};

export default TableView; 