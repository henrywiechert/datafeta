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
        // Subtle frame only when expanded (helps scan/understand the open "card")
        border: isExpanded ? '1px solid rgba(0,0,0,0.18)' : undefined,
        borderBottom: isExpanded ? undefined : '1px solid #e0e0e0',
        borderRadius: isExpanded ? 2 : 0,
        overflow: isExpanded ? 'hidden' : 'visible',
        mb: isExpanded ? 0.75 : 0.5,
        backgroundColor: isExpanded ? '#fafafa' : 'transparent',
        boxShadow: isExpanded ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 0.75,
          py: 0.4,
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: '#f5f5f5',
          },
        }}
        onClick={onToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          {isGlobal ? (
            <Chip
              size="small"
              label="ALL"
              color="default"
              sx={{ height: 18, fontSize: '0.65rem', px: 0.5 }}
            />
          ) : (
            <Chip
              size="small"
              label={axis?.toUpperCase()}
              color="default"
              sx={{ height: 18, fontSize: '0.65rem', px: 0.5, flexShrink: 0 }}
            />
          )}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              fontSize: '0.8rem',
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
          <Tooltip title="Reset overrides">
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <IconButton
                size="small"
                disabled={!hasOverride}
                sx={{ p: 0.25 }}
              >
                <RefreshIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
      {isExpanded && (
        <Box sx={{ px: 0.75, pb: 0.75, pt: 0.25 }}>
          {children}
        </Box>
      )}
    </Box>
  );
};

export default FieldOverrideRow;

