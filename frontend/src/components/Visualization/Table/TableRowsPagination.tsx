import React from 'react';
import { Box, IconButton, MenuItem, Select, Typography, Tooltip, Alert } from '@mui/material';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

interface TableRowsPaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading: boolean;
}

const PAGE_SIZES = [25, 50, 100, 250];

const TableRowsPagination: React.FC<TableRowsPaginationProps> = ({
  page,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
  loading,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const startRow = totalRows === 0 ? 0 : page * pageSize + 1;
  const endRow = Math.min((page + 1) * pageSize, totalRows);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 0.5,
        borderTop: '1px solid #e0e0e0',
        flexShrink: 0,
        minHeight: 36,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Rows per page:
        </Typography>
        <Select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          size="small"
          variant="standard"
          disabled={loading}
          sx={{ fontSize: '0.75rem', minWidth: 50 }}
        >
          {PAGE_SIZES.map((s) => (
            <MenuItem key={s} value={s} sx={{ fontSize: '0.75rem' }}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          {totalRows > 0 ? `${startRow.toLocaleString()}–${endRow.toLocaleString()} of ${totalRows.toLocaleString()}` : 'No data'}
        </Typography>

        <Tooltip title="First page">
          <span>
            <IconButton size="small" onClick={() => onPageChange(0)} disabled={loading || page === 0}>
              <FirstPageIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Previous page">
          <span>
            <IconButton size="small" onClick={() => onPageChange(page - 1)} disabled={loading || page === 0}>
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Next page">
          <span>
            <IconButton size="small" onClick={() => onPageChange(page + 1)} disabled={loading || page >= totalPages - 1}>
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Last page">
          <span>
            <IconButton size="small" onClick={() => onPageChange(totalPages - 1)} disabled={loading || page >= totalPages - 1}>
              <LastPageIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default TableRowsPagination;
