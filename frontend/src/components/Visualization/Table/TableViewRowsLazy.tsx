import React, { lazy, Suspense } from 'react';
import { Box, Skeleton } from '@mui/material';
import { TableRowsSortModel } from '../ChartArea/hooks/useTableRowsQuery';
import { QueryResultColumn } from '../../../types';

const TableViewRows = lazy(() => import('./TableViewRows'));

interface TableViewRowsLazyProps {
  rows: Record<string, any>[];
  columns: QueryResultColumn[];
  sortModel: TableRowsSortModel | null;
  onSortChanged: (sort: TableRowsSortModel | null) => void;
  loading: boolean;
}

const TableViewRowsSkeleton = () => (
  <Box
    sx={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      p: 2,
      backgroundColor: '#fff',
    }}
  >
    <Skeleton variant="rectangular" width="100%" height={56} sx={{ mb: 1, borderRadius: 1 }} />
    {[...Array(8)].map((_, i) => (
      <Skeleton
        key={i}
        variant="rectangular"
        width="100%"
        height={42}
        sx={{ mb: 0.5, opacity: 1 - i * 0.08 }}
      />
    ))}
  </Box>
);

const TableViewRowsLazy: React.FC<TableViewRowsLazyProps> = (props) => {
  return (
    <Suspense fallback={<TableViewRowsSkeleton />}>
      <TableViewRows {...props} />
    </Suspense>
  );
};

export default TableViewRowsLazy;
