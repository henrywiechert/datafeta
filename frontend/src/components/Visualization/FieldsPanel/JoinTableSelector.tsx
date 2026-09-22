// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
import { useDataSource } from '../../../contexts/DataSourceContext';
import RelationshipEditor from './RelationshipEditor';
import styles from './JoinTableSelector.module.css';

interface JoinTableSelectorProps {
  primaryTable: string;
  suggestedJoinableTables: string[];
  joinedTables: string[];
  onToggleJoin: (tableName: string) => void;
  editorOpen: boolean;
  onEditorOpenChange: (open: boolean) => void;
}

const JoinTableSelector: React.FC<JoinTableSelectorProps> = ({
  primaryTable,
  suggestedJoinableTables,
  joinedTables,
  onToggleJoin,
  editorOpen,
  onEditorOpenChange,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const { dataSource, setCustomRelationships } = useDataSource();

  // Build the list of all table names for the editor
  const allTableNames = React.useMemo(() => {
    const tableSet = new Set<string>();
    tableSet.add(primaryTable);
    suggestedJoinableTables.forEach(t => tableSet.add(t));
    joinedTables.forEach(t => tableSet.add(t));
    // Also include tables from the tables list in context
    dataSource.tables.forEach(t => tableSet.add(t.name));
    return Array.from(tableSet).sort();
  }, [primaryTable, suggestedJoinableTables, joinedTables, dataSource.tables]);

  const isUsed =
    suggestedJoinableTables.length > 0 ||
    joinedTables.length > 0 ||
    dataSource.customRelationships !== null;

  const editor = (
    <RelationshipEditor
      open={editorOpen}
      onClose={() => onEditorOpenChange(false)}
      database={dataSource.selectedDatabase}
      tables={allTableNames}
      customRelationships={dataSource.customRelationships}
      onSave={setCustomRelationships}
    />
  );

  if (!isUsed) {
    return editor;
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
          {dataSource.customRelationships !== null && (
            <Typography component="span" variant="caption" color="primary" sx={{ ml: 0.5 }}>
              (manual)
            </Typography>
          )}
        </Typography>
        {/*
          No relationships button here: the Data Source card header owns that
          action (CompactMetadataSelector), and it is shown whenever joins are
          supported and a table is selected — a superset of the cases where
          this box is visible. Two buttons for one dialog, at two different
          sizes, read as two different controls.
        */}
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

      {editor}
    </Box>
  );
};

export default JoinTableSelector;
