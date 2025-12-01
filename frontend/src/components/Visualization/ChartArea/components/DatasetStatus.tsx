import React from 'react';
import { Box, Typography } from '@mui/material';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';

/**
 * Status field displaying dataset dimensions (cols x rows).
 * Prepared to hold more information in the future.
 */
const DatasetStatus: React.FC = () => {
  const { state } = useVisualizationContext();
  const { queryResult } = state as any;

  // Calculate cols and rows
  const cols = queryResult?.columns?.length ?? 0;
  const rows = queryResult?.row_count ?? 0;

  // Don't show anything if there's no query result yet
  if (!queryResult) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        mr: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 500,
          fontSize: '0.75rem',
        }}
      >
        {rows.toLocaleString()} × {cols}
      </Typography>
    </Box>
  );
};

export default DatasetStatus;
