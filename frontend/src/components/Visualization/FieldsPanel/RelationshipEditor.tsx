import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  OutlinedInput,
  SelectChangeEvent,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { ForeignKeyRelationship } from '../../../types';
import { apiService } from '../../../apiService';

interface RelationshipEditorProps {
  open: boolean;
  onClose: () => void;
  database: string;
  tables: string[];  // All available tables
  customRelationships: ForeignKeyRelationship[] | null;
  onSave: (relationships: ForeignKeyRelationship[] | null) => void;
}

interface ColumnInfo {
  name: string;
  data_type: string;
}

const RELATIONSHIP_TYPES = [
  { value: 'one_to_one', label: 'One-to-One' },
  { value: 'one_to_many', label: 'One-to-Many' },
  { value: 'many_to_one', label: 'Many-to-One' },
  { value: 'many_to_many', label: 'Many-to-Many' },
] as const;

const RelationshipEditor: React.FC<RelationshipEditorProps> = ({
  open,
  onClose,
  database,
  tables,
  customRelationships,
  onSave,
}) => {
  const isManualMode = customRelationships !== null;
  const [manualMode, setManualMode] = useState(isManualMode);
  const [relationships, setRelationships] = useState<ForeignKeyRelationship[]>(
    customRelationships ?? []
  );
  const [columnsCache, setColumnsCache] = useState<Record<string, ColumnInfo[]>>({});
  const [loadingColumns, setLoadingColumns] = useState<string | null>(null);
  const [loadingHeuristic, setLoadingHeuristic] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setManualMode(customRelationships !== null);
      setRelationships(customRelationships ?? []);
    }
  }, [open, customRelationships]);

  // Fetch columns for a table (with caching)
  const fetchColumnsForTable = async (tableName: string): Promise<ColumnInfo[]> => {
    if (columnsCache[tableName]) {
      return columnsCache[tableName];
    }
    setLoadingColumns(tableName);
    try {
      const response = await apiService.listColumns(tableName, database || undefined);
      const columns = (response.columns || []).map((col: any) => ({
        name: col.name,
        data_type: col.data_type,
      }));
      setColumnsCache(prev => ({ ...prev, [tableName]: columns }));
      return columns;
    } catch (err) {
      console.warn(`Failed to fetch columns for ${tableName}:`, err);
      return [];
    } finally {
      setLoadingColumns(null);
    }
  };

  // Switch to manual mode, pre-populating with heuristic relationships
  const handleSwitchToManual = async () => {
    if (!manualMode) {
      setLoadingHeuristic(true);
      try {
        const response = await apiService.getTableRelationships(database);
        setRelationships(response.relationships || []);
      } catch (err) {
        console.warn('Failed to fetch heuristic relationships:', err);
        setRelationships([]);
      } finally {
        setLoadingHeuristic(false);
      }
    }
    setManualMode(true);
  };

  const handleSwitchToAuto = () => {
    setManualMode(false);
    setRelationships([]);
  };

  const handleAddRelationship = () => {
    const defaultFromTable = tables[0] || '';
    const defaultToTable = tables.length > 1 ? tables[1] : tables[0] || '';
    setRelationships(prev => [
      ...prev,
      {
        from_table: defaultFromTable,
        from_columns: [],
        to_table: defaultToTable,
        to_columns: [],
        relationship_type: 'many_to_one',
      },
    ]);
  };

  const handleRemoveRelationship = (index: number) => {
    setRelationships(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRelationship = (index: number, updates: Partial<ForeignKeyRelationship>) => {
    setRelationships(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleTableChange = (index: number, field: 'from_table' | 'to_table', value: string) => {
    // Reset columns when table changes
    const columnField = field === 'from_table' ? 'from_columns' : 'to_columns';
    handleUpdateRelationship(index, { [field]: value, [columnField]: [] });
    // Pre-fetch columns for the new table
    fetchColumnsForTable(value);
  };

  const handleColumnChange = (index: number, field: 'from_columns' | 'to_columns', value: string[]) => {
    handleUpdateRelationship(index, { [field]: value });
  };

  const handleSave = () => {
    if (manualMode) {
      // Filter out incomplete relationships
      const valid = relationships.filter(
        r => r.from_table && r.to_table && r.from_columns.length > 0 && r.to_columns.length > 0
      );
      onSave(valid);
    } else {
      onSave(null); // Auto-detect mode
    }
    onClose();
  };

  // Pre-fetch columns for any table referenced in relationships
  useEffect(() => {
    if (open && relationships.length > 0) {
      const tablesToFetch = new Set<string>();
      relationships.forEach(r => {
        if (r.from_table) tablesToFetch.add(r.from_table);
        if (r.to_table) tablesToFetch.add(r.to_table);
      });
      tablesToFetch.forEach(t => {
        if (!columnsCache[t]) {
          fetchColumnsForTable(t);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Table Relationships</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={manualMode}
                onChange={() => manualMode ? handleSwitchToAuto() : handleSwitchToManual()}
                disabled={loadingHeuristic}
              />
            }
            label={manualMode ? 'Manual — define relationships explicitly' : 'Auto — detect relationships from schema'}
          />
          {!manualMode && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Relationships are detected automatically from foreign key naming conventions.
              Switch to manual mode to define them explicitly.
            </Alert>
          )}
        </Box>

        {manualMode && (
          <>
            <Divider sx={{ mb: 2 }} />

            {relationships.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No relationships defined. Add one below.
              </Typography>
            )}

            {relationships.map((rel, index) => (
              <RelationshipRow
                key={index}
                relationship={rel}
                index={index}
                tables={tables}
                columnsCache={columnsCache}
                loadingColumns={loadingColumns}
                onTableChange={handleTableChange}
                onColumnChange={handleColumnChange}
                onUpdateRelationship={handleUpdateRelationship}
                onRemove={handleRemoveRelationship}
                onFetchColumns={fetchColumnsForTable}
              />
            ))}

            <Button
              startIcon={<AddIcon />}
              onClick={handleAddRelationship}
              variant="outlined"
              size="small"
              sx={{ mt: 1 }}
            >
              Add Relationship
            </Button>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// --- Relationship Row sub-component ---

interface RelationshipRowProps {
  relationship: ForeignKeyRelationship;
  index: number;
  tables: string[];
  columnsCache: Record<string, ColumnInfo[]>;
  loadingColumns: string | null;
  onTableChange: (index: number, field: 'from_table' | 'to_table', value: string) => void;
  onColumnChange: (index: number, field: 'from_columns' | 'to_columns', value: string[]) => void;
  onUpdateRelationship: (index: number, updates: Partial<ForeignKeyRelationship>) => void;
  onRemove: (index: number) => void;
  onFetchColumns: (tableName: string) => Promise<ColumnInfo[]>;
}

const RelationshipRow: React.FC<RelationshipRowProps> = ({
  relationship,
  index,
  tables,
  columnsCache,
  loadingColumns,
  onTableChange,
  onColumnChange,
  onUpdateRelationship,
  onRemove,
  onFetchColumns,
}) => {
  const fromColumns = columnsCache[relationship.from_table] || [];
  const toColumns = columnsCache[relationship.to_table] || [];

  return (
    <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Relationship {index + 1}
        </Typography>
        <IconButton size="small" onClick={() => onRemove(index)} color="error">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {/* From table */}
        <FormControl size="small" fullWidth>
          <InputLabel>From Table</InputLabel>
          <Select
            value={relationship.from_table}
            label="From Table"
            onChange={(e) => onTableChange(index, 'from_table', e.target.value)}
            onOpen={() => relationship.from_table && onFetchColumns(relationship.from_table)}
          >
            {tables.map(t => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* To table */}
        <FormControl size="small" fullWidth>
          <InputLabel>To Table</InputLabel>
          <Select
            value={relationship.to_table}
            label="To Table"
            onChange={(e) => onTableChange(index, 'to_table', e.target.value)}
            onOpen={() => relationship.to_table && onFetchColumns(relationship.to_table)}
          >
            {tables.map(t => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* From columns (multi-select for composite keys) */}
        <FormControl size="small" fullWidth>
          <InputLabel>From Columns</InputLabel>
          <Select
            multiple
            value={relationship.from_columns}
            label="From Columns"
            input={<OutlinedInput label="From Columns" />}
            onChange={(e: SelectChangeEvent<string[]>) => {
              const val = e.target.value;
              onColumnChange(index, 'from_columns', typeof val === 'string' ? val.split(',') : val);
            }}
            onOpen={() => relationship.from_table && onFetchColumns(relationship.from_table)}
            disabled={!relationship.from_table || loadingColumns === relationship.from_table}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map(value => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            {fromColumns.map(col => (
              <MenuItem key={col.name} value={col.name}>
                {col.name} <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({col.data_type})</Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* To columns (multi-select for composite keys) */}
        <FormControl size="small" fullWidth>
          <InputLabel>To Columns</InputLabel>
          <Select
            multiple
            value={relationship.to_columns}
            label="To Columns"
            input={<OutlinedInput label="To Columns" />}
            onChange={(e: SelectChangeEvent<string[]>) => {
              const val = e.target.value;
              onColumnChange(index, 'to_columns', typeof val === 'string' ? val.split(',') : val);
            }}
            onOpen={() => relationship.to_table && onFetchColumns(relationship.to_table)}
            disabled={!relationship.to_table || loadingColumns === relationship.to_table}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map(value => (
                  <Chip key={value} label={value} size="small" />
                ))}
              </Box>
            )}
          >
            {toColumns.map(col => (
              <MenuItem key={col.name} value={col.name}>
                {col.name} <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({col.data_type})</Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Relationship type */}
      <FormControl size="small" sx={{ mt: 1, minWidth: 160 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={relationship.relationship_type}
          label="Type"
          onChange={(e) => onUpdateRelationship(index, { relationship_type: e.target.value as ForeignKeyRelationship['relationship_type'] })}
        >
          {RELATIONSHIP_TYPES.map(rt => (
            <MenuItem key={rt.value} value={rt.value}>{rt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default RelationshipEditor;
