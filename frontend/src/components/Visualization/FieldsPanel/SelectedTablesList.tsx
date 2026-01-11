import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import styles from './SelectedTablesList.module.css';

type UnionTableRef = { database: string; table_name: string };

interface SelectedTablesListProps {
  primaryDatabase: string;
  primaryTable: string;
  unionTables: UnionTableRef[];
  onRemovePrimary: () => void;
  onRemoveUnionTable: (database: string, tableName: string) => void;
}

const SelectedTablesList: React.FC<SelectedTablesListProps> = ({
  primaryDatabase,
  primaryTable,
  unionTables,
  onRemovePrimary,
  onRemoveUnionTable,
}) => {
  const hasPrimary = !!primaryDatabase && !!primaryTable;
  const hasAny = hasPrimary || unionTables.length > 0;

  if (!hasAny) return null;

  return (
    <Box className={styles.container}>
      <Typography
        variant="subtitle2"
        fontWeight="bold"
        align="left"
        fontSize="0.85rem"
        gutterBottom
        sx={{ marginBottom: 0.2 }}
      >
        Selected Tables
      </Typography>

      <List dense disablePadding className={styles.list}>
        {hasPrimary && (
          <ListItem divider className={styles.listItem}>
            <ListItemText
              primary={
                <Box className={styles.primaryRow}>
                  <Chip label="Primary" size="small" color="primary" className={styles.roleChip} />
                  <span className={styles.tableName}>
                    {primaryDatabase}.{primaryTable}
                  </span>
                </Box>
              }
              secondary={<span className={styles.metaPlaceholder}>Rows: — • Cols: —</span>}
            />
            <ListItemSecondaryAction>
              <IconButton
                size="small"
                edge="end"
                aria-label="Remove primary table (clears selection)"
                onClick={onRemovePrimary}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        )}

        {unionTables.map((t) => {
          const key = `${t.database}.${t.table_name}`;
          return (
            <ListItem key={key} divider className={styles.listItem}>
              <ListItemText
                primary={
                  <Box className={styles.primaryRow}>
                    <Chip label="UNION" size="small" variant="outlined" className={styles.roleChip} />
                    <span className={styles.tableName}>{key}</span>
                  </Box>
                }
                secondary={<span className={styles.metaPlaceholder}>Rows: — • Cols: —</span>}
              />
              <ListItemSecondaryAction>
                <IconButton
                  size="small"
                  edge="end"
                  aria-label={`Remove ${key} from union`}
                  onClick={() => onRemoveUnionTable(t.database, t.table_name)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};

export default SelectedTablesList;
