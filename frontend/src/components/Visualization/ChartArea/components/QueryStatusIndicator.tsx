import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
// Replaced icon with a background chip style
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';

/**
 * Small status indicator for the last query run.
 * - Green when last query succeeded
 * - Red when last query failed
 * - Grey when no query was run yet
 */
const QueryStatusIndicator: React.FC<{ size?: number }> = ({ size = 12 }) => {
  const { state } = useVisualizationContext();
  const { queryResult, queryError } = state as any;

  type Status = 'ok' | 'error' | 'unknown';
  let status: Status = 'unknown';
  if (queryError) status = 'error';
  else if (queryResult) status = 'ok';

  const getColor = (s: Status) => {
    switch (s) {
      case 'ok': return 'success.main';
      case 'error': return 'error.main';
      default: return 'action.disabledBackground';
    }
  };

  const title = queryError
    ? `Last query failed: ${queryError}`
    : queryResult
      ? `Last query OK (${(queryResult as any).row_count ?? 'n/a'} rows)`
      : 'No query executed yet';

  return (
    <Tooltip title={title} arrow>
      <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>
        <Typography
          data-testid="query-status-indicator"
          aria-label={`Query status: ${status}`}
          aria-live="polite"
          role="status"
          component="span"
          variant="caption"
          sx={{
            px: 1.25,
            py: 0.2,
            borderRadius: '999px',
            fontWeight: 700,
            bgcolor: getColor(status),
            color: status === 'unknown' ? 'text.primary' : 'common.white',
            ariaLive: 'polite',
            display: 'inline-block',
            textTransform: 'none',
          }}
        >
          Query
        </Typography>
      </Box>
    </Tooltip>
  );
};

export default QueryStatusIndicator;
