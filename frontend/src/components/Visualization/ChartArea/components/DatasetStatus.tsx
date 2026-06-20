// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';

interface DatasetStatusProps {
  /**
   * When set, the status reflects the table view instead of the chart query
   * result. The table view fetches exact, paginated raw rows, so it is never
   * sampled — the "S" pill always shows the not-sampled state.
   */
  tableOverride?: { rows: number; cols: number } | null;
}

/**
 * Status field displaying dataset dimensions (cols x rows).
 * Shows a sampling indicator pill when the result was capped by a budget.
 */
const DatasetStatus: React.FC<DatasetStatusProps> = ({ tableOverride }) => {
  const { state } = useVisualizationContext();
  const { queryResult } = state as any;

  const isTableMode = !!tableOverride;
  const cols = isTableMode ? tableOverride!.cols : (queryResult?.columns?.length ?? 0);
  const rows = isTableMode ? tableOverride!.rows : (queryResult?.row_count ?? 0);
  // Table view is exact raw rows; never sampled.
  const sampled = isTableMode ? undefined : queryResult?.sampled;

  if (!isTableMode && !queryResult) {
    return null;
  }

  const samplingTooltip = sampled
    ? sampled.type === 'line'
      ? `Result limited by a line budget (max ${sampled.limit.toLocaleString()} rows)`
      : `Result limited by a point budget (max ${sampled.limit.toLocaleString()} rows)`
    : 'Not sampled';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        mr: 1,
        gap: 0.75,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 500,
          fontSize: '0.8rem',
        }}
      >
        {rows.toLocaleString()} × {cols}
      </Typography>
      <Tooltip title={samplingTooltip} arrow placement="bottom">
        <Typography
          component="span"
          variant="caption"
          sx={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            fontWeight: 700,
            fontSize: '0.7rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            bgcolor: sampled ? 'warning.main' : 'transparent',
            color: sampled ? 'common.white' : 'text.disabled',
            border: sampled ? 'none' : '1.5px solid',
            borderColor: sampled ? undefined : 'action.disabled',
            transition: 'background-color 0.2s, color 0.2s',
            cursor: 'default',
          }}
        >
          S
        </Typography>
      </Tooltip>
    </Box>
  );
};

export default DatasetStatus;
