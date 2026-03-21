import React, { lazy, Suspense } from 'react';
import { Box, Skeleton } from '@mui/material';
import { QueryResultColumn } from '../../../types';

// Lazy load the entire TableView component (which includes AG-Grid)
const TableView = lazy(() => import('./TableView'));

interface TableViewLazyProps {
  columns: any[];
  rows: any[];
  xFields: any[];
  yFields: any[];
  queryColumns?: QueryResultColumn[];
}

/**
 * Loading skeleton for table view
 * Mimics the appearance of AG-Grid while it loads
 */
const TableViewSkeleton = () => (
  <Box 
    sx={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex',
      flexDirection: 'column',
      p: 2,
      backgroundColor: '#fff'
    }}
  >
    {/* Header skeleton */}
    <Skeleton 
      variant="rectangular" 
      width="100%" 
      height={56} 
      sx={{ mb: 1, borderRadius: 1 }} 
    />
    
    {/* Table rows skeleton */}
    {[...Array(8)].map((_, index) => (
      <Skeleton 
        key={index}
        variant="rectangular" 
        width="100%" 
        height={42} 
        sx={{ mb: 0.5, opacity: 1 - (index * 0.08) }} 
      />
    ))}
  </Box>
);

/**
 * Lazy-loaded wrapper for TableView component
 * This defers loading of AG-Grid (~200KB) until the table view is actually needed
 */
const TableViewLazy: React.FC<TableViewLazyProps> = (props) => {
  return (
    <Suspense fallback={<TableViewSkeleton />}>
      <TableView {...props} />
    </Suspense>
  );
};

export default TableViewLazy;
