// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import { v4 as uuidv4 } from 'uuid';
import { PropertySection } from '../Properties';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Field } from '../../../types';
import { isMeasureNamesField, isMeasureValuesField } from '../../../utils/syntheticFields';
import { readDragPayload } from '../../../utils/dragDataStore';
import FieldChip from '../FieldChip';
import filterDropZoneStyles from '../Filters/FilterDropZone.module.css';

const MeasureGroupsPanel: React.FC = () => {
  const { dataSource } = useDataSource();
  const { state, dispatch } = useVisualizationContext();
  const [isOver, setIsOver] = useState(false);

  // measureGroupFields now comes from VisualizationContext (per-sheet scope)
  const measureGroupFields = state.measureGroupFields;
  const { availableFields } = dataSource;

  const measureFields = useMemo(
    () => availableFields.filter((field) => field.type === 'measure' && !field.isSynthetic),
    [availableFields]
  );

  const measureFieldMap = useMemo(() => {
    const map = new Map<string, Field>();
    measureFields.forEach((field) => map.set(field.columnName, field));
    return map;
  }, [measureFields]);

  const orderedMeasureFields = useMemo(() => measureGroupFields, [measureGroupFields]);

  const handleFieldUpdate = (updated: Field | Field[]) => {
    const updatedFields = Array.isArray(updated) ? updated : [updated];
    const updatedMap = new Map(updatedFields.map((field) => [field.id, field]));
    const nextFields = measureGroupFields.map((field) =>
      updatedMap.has(field.id) ? updatedMap.get(field.id)! : field
    );
    if (nextFields.some((field, index) => field !== measureGroupFields[index])) {
      dispatch({ type: 'SET_MEASURE_GROUP_FIELDS', payload: nextFields });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    try {
      const parsed = readDragPayload(e.nativeEvent.dataTransfer ?? undefined);
      if (!parsed) return;
      let fields: Field[] = parsed.fields;

      if (!fields || fields.length === 0) {
        return;
      }

      const existingNames = new Set(measureGroupFields.map((field) => field.columnName));
      const nextFields = [...measureGroupFields];
      let didChange = false;

      fields.forEach((field) => {
        if (isMeasureNamesField(field) || isMeasureValuesField(field)) {
          return;
        }
        if (field.type !== 'measure') {
          return;
        }
        const sourceField = measureFieldMap.get(field.columnName);
        if (!sourceField) {
          return;
        }
        if (!existingNames.has(sourceField.columnName)) {
          nextFields.push({
            ...sourceField,
            id: uuidv4(),
            axis: undefined,
          });
          existingNames.add(sourceField.columnName);
          didChange = true;
        }
      });

      if (didChange) {
        dispatch({ type: 'SET_MEASURE_GROUP_FIELDS', payload: nextFields });
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };

  const handleClear = () => {
    if (measureGroupFields.length === 0) {
      return;
    }
    dispatch({ type: 'CLEAR_MEASURE_GROUP' });
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
      title="Measure Group"
      icon={<CategoryIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="measureGroupPanel.expanded"
      headerActions={
        measureGroupFields.length > 0 ? (
          <Button size="small" onClick={handleClear} sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.75rem' }}>
            Clear
          </Button>
        ) : null
      }
    >
      <Box
        className={`${filterDropZoneStyles.dropZone} ${isOver ? filterDropZoneStyles.isOver : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          setIsOver(false);
          handleDrop(e);
        }}
      >
        {orderedMeasureFields.length === 0 ? (
          <Typography variant="body2" className={filterDropZoneStyles.placeholder}>
            Measures
          </Typography>
        ) : (
          <Box className={filterDropZoneStyles.fieldsList}>
            {orderedMeasureFields.map((field) => (
              <FieldChip
                key={field.id}
                field={field}
                source="MEASURE_GROUP"
                onUpdate={handleFieldUpdate}
                allFields={orderedMeasureFields}
                onRemoveFromZone={(fieldIds) => {
                  dispatch({ type: 'REMOVE_MEASURES_FROM_GROUP', payload: fieldIds });
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
