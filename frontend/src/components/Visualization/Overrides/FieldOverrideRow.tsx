import React from 'react';
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

interface FieldOverrideRowProps {
  id: string;
  label: string;
  axis?: 'x' | 'y';
  isGlobal: boolean;
  hasOverride: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onClear: () => void;
  children: React.ReactNode;
}

const FieldOverrideRow: React.FC<FieldOverrideRowProps> = ({
  id,
  label,
  axis,
  isGlobal,
  hasOverride,
  isExpanded,
  onToggle,
  onClear,
  children,
}) => {
  return (
    <Box
      sx={{
        border: '1px solid #e0e0e0',
        borderRadius: 1,
        mb: 0.75,
        backgroundColor: isExpanded ? '#f5f5f5' : '#fafafa',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          {isGlobal ? (
            <Chip
              size="small"
              label="ALL"
              color="default"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          ) : (
            <Chip
              size="small"
              label={axis?.toUpperCase()}
              color="default"
              sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }}
            />
          )}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={label}
          >
            {label}
          </Typography>
        </Box>
        {!isGlobal && (
          <Tooltip title="Reset overrides for this field">
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <IconButton
                size="small"
                disabled={!hasOverride}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
      {isExpanded && (
        <Box sx={{ px: 1, pb: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  );
};

export default FieldOverrideRow;

