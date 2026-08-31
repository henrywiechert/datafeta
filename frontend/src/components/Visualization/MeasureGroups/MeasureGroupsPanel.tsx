// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import EditIcon from '@mui/icons-material/Edit';
import { v4 as uuidv4 } from 'uuid';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Field } from '../../../types';
import { isMeasureNamesField, isMeasureValuesField } from '../../../utils/syntheticFields';
import { readDragPayload } from '../../../utils/dragDataStore';
import FieldChip from '../FieldChip';
import filterDropZoneStyles from '../Filters/FilterDropZone.module.css';

const MeasureGroupsPanel: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const [isOver, setIsOver] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const { measureGroup } = state;
  const members = measureGroup.members;

  const handleFieldUpdate = (updated: Field | Field[]) => {
    const updatedFields = Array.isArray(updated) ? updated : [updated];
    updatedFields.forEach((field) => {
      dispatch({ type: 'UPDATE_MEASURE_GROUP_MEMBER', payload: field });
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    try {
      const parsed = readDragPayload(e.nativeEvent.dataTransfer ?? undefined);
      if (!parsed) return;
      const fields: Field[] = parsed.fields;

      if (!fields || fields.length === 0) {
        return;
      }

      fields.forEach((field) => {
        if (isMeasureNamesField(field) || isMeasureValuesField(field)) {
          return;
        }
        if (field.type !== 'measure') {
          return;
        }
        // Fresh instance id: the member id is the stable key for per-member overrides.
        // Same column with a different aggregation is a distinct member (Tableau-style);
        // exact duplicates are rejected by the reducer.
        dispatch({
          type: 'ADD_MEASURE_GROUP_MEMBER',
          payload: { ...field, id: uuidv4(), axis: undefined },
        });
      });
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };

  const handleClear = () => {
    if (members.length === 0) {
      return;
    }
    dispatch({ type: 'CLEAR_MEASURE_GROUP' });
  };

  const startEditingName = () => {
    setNameDraft(measureGroup.name);
    setIsEditingName(true);
  };

  const commitName = () => {
    setIsEditingName(false);
    dispatch({ type: 'RENAME_MEASURE_GROUP', payload: nameDraft });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  };

  return (
    <PropertySection
      title={measureGroup.name}
      icon={<CategoryIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="measureGroupPanel.expanded"
      headerActions={
        members.length > 0 ? (
          <Button size="small" onClick={handleClear} sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.75rem' }}>
            Clear
          </Button>
        ) : null
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        {isEditingName ? (
          <TextField
            size="small"
            variant="standard"
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setIsEditingName(false);
            }}
            inputProps={{ 'aria-label': 'Measure group name' }}
          />
        ) : (
          <>
            <Typography variant="caption" color="text.secondary">
              {measureGroup.name}
            </Typography>
            <IconButton size="small" onClick={startEditingName} aria-label="Rename measure group">
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </>
        )}
      </Box>
      <Box
        className={`${filterDropZoneStyles.dropZone} ${isOver ? filterDropZoneStyles.isOver : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          setIsOver(false);
          handleDrop(e);
        }}
      >
        {members.length === 0 ? (
          <Typography variant="body2" className={filterDropZoneStyles.placeholder}>
            Measures
          </Typography>
        ) : (
          <Box className={filterDropZoneStyles.fieldsList}>
            {members.map((field) => (
              <FieldChip
                key={field.id}
                field={field}
                source="MEASURE_GROUP"
                onUpdate={handleFieldUpdate}
                allFields={members}
                onRemoveFromZone={(fieldIds) => {
                  dispatch({ type: 'REMOVE_MEASURE_GROUP_MEMBERS', payload: fieldIds });
                }}
              />
            ))}
          </Box>
        )}
      </Box>
    </PropertySection>
  );
};

export default MeasureGroupsPanel;
