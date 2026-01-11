import React from 'react';
import { 
  Box, 
  Typography, 
  Chip, 
  Tooltip, 
  IconButton,
  Collapse
} from '@mui/material';
import AddLinkIcon from '@mui/icons-material/AddLink';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import styles from './JoinTableSelector.module.css';

interface JoinTableSelectorProps {
  primaryTable: string;
  suggestedJoinableTables: string[];
  joinedTables: string[];
  onToggleJoin: (tableName: string) => void;
}

const JoinTableSelector: React.FC<JoinTableSelectorProps> = ({
  primaryTable,
  suggestedJoinableTables,
  joinedTables,
  onToggleJoin,
}) => {
  const [expanded, setExpanded] = React.useState(false);

  if (suggestedJoinableTables.length === 0) {
    return null; // No joinable tables to show
  }

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography 
          variant="subtitle2"
          fontWeight="bold"
          fontSize="0.85rem"
        >
          Related Tables
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
          {suggestedJoinableTables.map((tableName) => {
            const isJoined = joinedTables.includes(tableName);
            
            return (
              <Tooltip 
                key={tableName}
                title={isJoined ? `Click to remove join with ${tableName}` : `Click to join with ${tableName}`}
                arrow
              >
                <Chip
                  label={tableName}
                  onClick={() => onToggleJoin(tableName)}
                  icon={isJoined ? <LinkOffIcon /> : <AddLinkIcon />}
                  color={isJoined ? "primary" : "default"}
                  variant={isJoined ? "filled" : "outlined"}
                  className={styles.tableChip}
                  size="small"
                />
              </Tooltip>
            );
          })}
        </Box>

        {joinedTables.length > 0 && (
          <Box className={styles.joinInfo}>
            <Typography variant="caption" color="text.secondary">
              {joinedTables.length} {joinedTables.length === 1 ? 'table' : 'tables'} joined to {primaryTable}
            </Typography>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default JoinTableSelector;
