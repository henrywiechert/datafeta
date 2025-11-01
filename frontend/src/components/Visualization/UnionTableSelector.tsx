import React from 'react';
import { 
  Box, 
  Typography, 
  Chip, 
  Tooltip, 
  IconButton,
  Collapse
} from '@mui/material';
import MergeIcon from '@mui/icons-material/Merge';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import styles from './UnionTableSelector.module.css';

interface UnionTableSelectorProps {
  primaryTable: string;
  suggestedUnionableTables: string[];
  unionTables: string[];
  onToggleUnion: (tableName: string) => void;
}

const UnionTableSelector: React.FC<UnionTableSelectorProps> = ({
  primaryTable,
  suggestedUnionableTables,
  unionTables,
  onToggleUnion,
}) => {
  const [expanded, setExpanded] = React.useState(false);

  if (suggestedUnionableTables.length === 0) {
    return null; // No unionable tables to show
  }

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography 
          variant="subtitle2"
          fontWeight="bold"
          fontSize="0.85rem"
        >
          Combine Similar Tables
        </Typography>
        <IconButton 
          size="small" 
          onClick={() => setExpanded(!expanded)}
          className={styles.expandButton}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box className={styles.tableList}>
          {suggestedUnionableTables.map((tableName) => {
            const isUnioned = unionTables.includes(tableName);
            
            return (
              <Tooltip 
                key={tableName}
                title={isUnioned ? `Click to remove ${tableName} from union` : `Click to combine with ${tableName}`}
                arrow
              >
                <Chip
                  label={tableName}
                  onClick={() => onToggleUnion(tableName)}
                  icon={isUnioned ? <RemoveCircleOutlineIcon /> : <MergeIcon />}
                  color={isUnioned ? "secondary" : "default"}
                  variant={isUnioned ? "filled" : "outlined"}
                  className={styles.tableChip}
                  size="small"
                />
              </Tooltip>
            );
          })}
        </Box>

        {unionTables.length > 0 && (
          <Box className={styles.unionInfo}>
            <Typography variant="caption" color="text.secondary">
              Combining {unionTables.length + 1} {unionTables.length === 0 ? 'table' : 'tables'} ({primaryTable} + {unionTables.length} more)
            </Typography>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default UnionTableSelector;
