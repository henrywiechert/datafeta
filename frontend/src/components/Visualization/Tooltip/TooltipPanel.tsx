import React from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { Box, Typography, Chip } from '@mui/material';

const TooltipPanel: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();
  const { tooltipFields } = state;

  const handleTooltipDrop = (field: Field, source: DragSource) => {
    // Don't add if already present
    if (tooltipFields.some(f => f.columnName === field.columnName)) {
      return;
    }
    dispatch({ type: 'ADD_TOOLTIP_FIELD', payload: field });
  };

  const handleRemoveFromTooltip = (fieldId: string) => {
    dispatch({ type: 'REMOVE_TOOLTIP_FIELD', payload: fieldId });
  };

  return (
    <PropertySection
      title="Tooltip"
      icon={<InfoOutlinedIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="tooltipPanel.expanded"
    >
      <Box
        sx={{ border: '1px dashed #e0e0e0', p: 1, borderRadius: 1, minHeight: 48, bgcolor: '#fafafa' }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          // FieldChip sets 'application/json' with { field, source, index }
          const payload = e.dataTransfer.getData('application/json');
          if (!payload) return;
          try {
            const parsed = JSON.parse(payload);
            const field: Field = parsed.field || parsed; // fallback if older format
            const source: DragSource = parsed.source || 'AVAILABLE_FIELDS';
            handleTooltipDrop(field, source);
          } catch (err) {
            console.warn('Failed to parse dropped field for tooltip zone', err);
          }
        }}
      >
        {tooltipFields.length === 0 && (
          <Typography variant="caption" sx={{ color: '#666' }}>
            Drop fields here to show in tooltips only.
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {tooltipFields.map(f => (
            <Chip
              key={f.id}
              size="small"
              label={f.columnName}
              onDelete={() => handleRemoveFromTooltip(f.id)}
            />
          ))}
        </Box>
      </Box>
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" sx={{ color: '#666', display: 'block' }}>
          Tooltip fields do not affect the chart visualization—they only appear when hovering.
        </Typography>
      </Box>
    </PropertySection>
  );
};

export default TooltipPanel;

