import React from 'react';
import { 
  Box, 
  Typography, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper,
  Chip,
  IconButton,
  Toolbar,
  Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

interface DataRow {
  [key: string]: string | number | boolean | null;
}

interface DataPreviewPanelProps {
  data?: DataRow[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onExport?: () => void;
}

// Sample data for demonstration
const SAMPLE_DATA: DataRow[] = [
  { id: 1, product: 'Laptop', category: 'Electronics', price: 999.99, quantity: 15, date: '2024-01-15' },
  { id: 2, product: 'Mouse', category: 'Electronics', price: 29.99, quantity: 100, date: '2024-01-14' },
  { id: 3, product: 'Keyboard', category: 'Electronics', price: 79.99, quantity: 50, date: '2024-01-13' },
  { id: 4, product: 'Monitor', category: 'Electronics', price: 299.99, quantity: 25, date: '2024-01-12' },
  { id: 5, product: 'Desk Chair', category: 'Furniture', price: 199.99, quantity: 8, date: '2024-01-11' },
];

const DataPreviewPanel: React.FC<DataPreviewPanelProps> = ({ 
  data = SAMPLE_DATA,
  isLoading = false,
  onRefresh,
  onExport 
}) => {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        color: 'text.secondary'
      }}>
        <Typography variant="body2">
          No data available. Select a table to preview data.
        </Typography>
      </Box>
    );
  }

  const columns = Object.keys(data[0]);
  const displayData = data.slice(0, 10); // Show first 10 rows

  const getColumnType = (value: any) => {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    return 'text';
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return <Chip label="NULL" size="small" color="default" />;
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'boolean') return <Chip label={value.toString()} size="small" color={value ? 'success' : 'error'} />;
    return value.toString();
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Toolbar variant="dense" sx={{ minHeight: 40, gap: 1 }}>
        <Typography variant="body2" sx={{ flexGrow: 1 }}>
          Showing {displayData.length} of {data.length} rows
        </Typography>
        <IconButton size="small" onClick={onRefresh} disabled={isLoading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onExport}>
          <FileDownloadIcon fontSize="small" />
        </IconButton>
      </Toolbar>

      {/* Data Table */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <TableContainer component={Paper} variant="outlined" sx={{ height: '100%' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column} sx={{ fontWeight: 'bold', backgroundColor: 'grey.50' }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography variant="body2" fontWeight="bold">
                        {column}
                      </Typography>
                      <Chip 
                        label={getColumnType(data[0][column])} 
                        size="small" 
                        variant="outlined"
                        color="primary"
                        sx={{ fontSize: '0.7rem', height: 16 }}
                      />
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {displayData.map((row, index) => (
                <TableRow key={index} hover>
                  {columns.map((column) => (
                    <TableCell key={column}>
                      {formatValue(row[column])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Footer */}
      {data.length > 10 && (
        <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
          <Button size="small" variant="outlined">
            Load More ({data.length - 10} remaining)
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default DataPreviewPanel; 