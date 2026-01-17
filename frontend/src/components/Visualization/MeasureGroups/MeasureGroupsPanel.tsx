import React, { useMemo } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import { PropertySection, PropertyDropZone } from '../Properties';
import { useDataSource } from '../../../contexts/DataSourceContext';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Field } from '../../../types';
import { isMeasureNamesField, isMeasureValuesField } from '../../../utils/syntheticFields';

const MeasureGroupsPanel: React.FC = () => {
  const { dataSource, setMeasureGroupMeasures } = useDataSource();
  const { dispatch } = useVisualizationContext();

  const { measureGroupMeasures, availableFields } = dataSource;

  const measureFields = useMemo(
    () => availableFields.filter((field) => field.type === 'measure' && !field.isSynthetic),
    [availableFields]
  );

  const measureFieldMap = useMemo(() => {
    const map = new Map<string, Field>();
    measureFields.forEach((field) => map.set(field.columnName, field));
    return map;
  }, [measureFields]);

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

      const nextMeasures = new Set(measureGroupMeasures);
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
        if (!nextMeasures.has(sourceField.columnName)) {
          nextMeasures.add(sourceField.columnName);
          didChange = true;
        }
      });

      if (didChange) {
        setMeasureGroupMeasures(Array.from(nextMeasures));
        dispatch({ type: 'FORCE_QUERY_REFRESH' });
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
    }
  };

  const handleRemove = (measure: string) => {
    const nextMeasures = measureGroupMeasures.filter((item) => item !== measure);
    if (nextMeasures.length === measureGroupMeasures.length) {
      return;
    }
    setMeasureGroupMeasures(nextMeasures);
    dispatch({ type: 'FORCE_QUERY_REFRESH' });
  };

  const handleClear = () => {
    if (measureGroupMeasures.length === 0) {
      return;
    }
    setMeasureGroupMeasures([]);
    dispatch({ type: 'FORCE_QUERY_REFRESH' });
  };

  return (
    <PropertySection
      title="Measure Group"
      icon={<CategoryIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="measureGroupPanel.expanded"
      headerActions={
        <Button size="small" onClick={handleClear} disabled={measureGroupMeasures.length === 0}>
          Clear
        </Button>
      }
    >
      <PropertyDropZone
        hasContent={true}
        emptyMessage=""
        onDrop={handleDrop}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {measureGroupMeasures.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Drag measures here to define MeasureNames/MeasureValues
            </Typography>
          ) : (
            measureGroupMeasures.map((measure) => (
              <Chip
                key={measure}
                label={measure}
                onDelete={() => handleRemove(measure)}
                size="small"
                variant="outlined"
              />
            ))
          )}
        </Box>
      </PropertyDropZone>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        {measureGroupMeasures.length === 0
          ? 'No measures selected'
          : `${measureGroupMeasures.length} measure${measureGroupMeasures.length === 1 ? '' : 's'} selected`}
      </Typography>
    </PropertySection>
  );
};

export default MeasureGroupsPanel;
