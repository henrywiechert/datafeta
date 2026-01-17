import React, { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import { v4 as uuidv4 } from 'uuid';
import { PropertySection, PropertyDropZone } from '../Properties';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Field } from '../../../types';
import { isMeasureNamesField, isMeasureValuesField } from '../../../utils/syntheticFields';
import FieldChip from '../FieldChip';

const MeasureGroupsPanel: React.FC = () => {
  const { dataSource, setMeasureGroupFields, removeMeasureFromGroup, clearMeasureGroup } = useDataSource();
  const { dispatch } = useVisualizationContext();

  const { measureGroupFields, availableFields } = dataSource;

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
      setMeasureGroupFields(nextFields);
      dispatch({ type: 'FORCE_QUERY_REFRESH' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;
      const parsed = JSON.parse(data);
      let fields: Field[] = parsed.fields;

      if (!fields && parsed.field) {
        fields = [parsed.field];
      }
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
        setMeasureGroupFields(nextFields);
        dispatch({ type: 'FORCE_QUERY_REFRESH' });
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };

  const handleClear = () => {
    if (measureGroupFields.length === 0) {
      return;
    }
    clearMeasureGroup();
    dispatch({ type: 'FORCE_QUERY_REFRESH' });
  };

  return (
    <PropertySection
      title="Measure Group"
      icon={<CategoryIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="measureGroupPanel.expanded"
      headerActions={
        <Button size="small" onClick={handleClear} disabled={measureGroupFields.length === 0}>
          Clear
        </Button>
      }
    >
      <PropertyDropZone
        hasContent={true}
        emptyMessage=""
        onDrop={handleDrop}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
          {orderedMeasureFields.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Drag measures here to define MeasureNames/MeasureValues
            </Typography>
          ) : (
            orderedMeasureFields.map((field) => (
              <FieldChip
                key={field.id}
                field={field}
                source="MEASURE_GROUP"
                onUpdate={handleFieldUpdate}
                allFields={orderedMeasureFields}
                onRemoveFromZone={(fieldIds) => {
                  removeMeasureFromGroup(fieldIds);
                  dispatch({ type: 'FORCE_QUERY_REFRESH' });
                }}
              />
            ))
          )}
        </Box>
      </PropertyDropZone>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        {measureGroupFields.length === 0
          ? 'No measures selected'
          : `${measureGroupFields.length} measure${measureGroupFields.length === 1 ? '' : 's'} selected`}
      </Typography>
    </PropertySection>
  );
};

export default MeasureGroupsPanel;
