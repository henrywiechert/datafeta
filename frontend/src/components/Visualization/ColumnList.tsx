import React from 'react';
import {
  List,
  ListItem,
  ListItemText,
  Typography,
  Divider,
} from '@mui/material';
import { Column } from '../../types';
import styles from './ColumnList.module.css';

interface ColumnListProps {
  columns: Column[];
  isLoading: boolean; // Propagate loading state if needed for future spinners
  showNoColumnsMessage: boolean; // Explicitly control the "No columns" message
}

function ColumnList({ columns, isLoading, showNoColumnsMessage }: ColumnListProps) {
  return (
    <>
      <Divider className={styles.columnListDivider} />
      <Typography variant="h6" gutterBottom>Columns</Typography>
      {columns.length > 0 ? (
        <List dense className={styles.columnList}>
          {columns.map(col => (
            <ListItem key={col.name} divider className={styles.columnListItem}>
              <ListItemText
                primary={col.name}
                secondary={col.data_type}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                // Use className for further styling if needed
                // primaryTypographyProps={{ variant: 'body2', className: styles.listItemPrimary }}
                // secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary', className: styles.listItemSecondary }}
              />
              {/* TODO: Add drag handle */}
            </ListItem>
          ))}
        </List>
      ) : (
        showNoColumnsMessage && !isLoading && (
          <Typography variant="body2" color="text.secondary" className={styles.noColumnsText}>
            No columns found.
          </Typography>
        )
      )}
    </>
  );
}

export default ColumnList; 