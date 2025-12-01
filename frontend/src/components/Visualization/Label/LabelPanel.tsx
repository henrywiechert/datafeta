import React, { useMemo } from 'react';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import { Field, DragSource } from '../../../types';
import { PropertySection } from '../Properties';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';
import { useDragDrop } from '../../../hooks/useDragDrop';
import { Box, Switch, Tooltip, Typography, IconButton, Chip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

interface LabelPanelProps {
  projectedPointCount?: number; // optional precomputed count for warning logic
}

const HARD_CAP = 5000;

const LabelPanel: React.FC<LabelPanelProps> = ({ projectedPointCount }) => {
  const { state, dispatch } = useVisualizationContext();
  const { handleLabelDrop, handleRemoveFromLabel } = useDragDrop();
  const {
    labelFields,
    labelsEnabled,
    labelSamplingStrategy,
    labelSamplingThreshold,
  } = state;

  // Derived flags
  const overThreshold = projectedPointCount !== undefined && projectedPointCount > labelSamplingThreshold;
  const exceedsHardCap = projectedPointCount !== undefined && projectedPointCount > HARD_CAP;
  const autoSuppressed = labelsEnabled && labelSamplingStrategy === 'auto' && overThreshold;

  const canShowOverrideAll = labelsEnabled && (overThreshold || exceedsHardCap);

  const handleToggleEnabled = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_LABELS_ENABLED', payload: e.target.checked });
  };

  const handleStrategyChange = (strategy: 'auto' | 'all' | 'sample') => {
    dispatch({ type: 'SET_LABEL_SAMPLING_STRATEGY', payload: strategy });
  };

  // Display message logic
  const warningMessage = useMemo(() => {
    if (!labelsEnabled) return null;
    if (exceedsHardCap && labelSamplingStrategy === 'all') {
      return `Labels capped above ${HARD_CAP}. Consider sampling.`;
    }
    if (autoSuppressed) {
      return `Auto sampling suppressed labels (> ${labelSamplingThreshold} marks).`;
    }
    return null;
  }, [labelsEnabled, exceedsHardCap, labelSamplingStrategy, autoSuppressed, labelSamplingThreshold]);

  return (
    <PropertySection
      title="Label"
      icon={<LabelOutlinedIcon fontSize="small" />}
      defaultExpanded={false}
      storageKey="labelPanel.expanded"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Switch size="small" checked={labelsEnabled} onChange={handleToggleEnabled} />
        <Typography variant="body2" sx={{ ml: 1 }}>Show labels</Typography>
      </Box>
      <Box sx={{ border: '1px dashed #e0e0e0', p: 1, borderRadius: 1, minHeight: 48, bgcolor: '#fafafa' }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const payload = e.dataTransfer.getData('application/json');
          if (!payload) return;
          try {
            const parsed = JSON.parse(payload);
            
            // Handle unified payload format (always arrays) and legacy format
            let fields = parsed.fields;
            const source: DragSource = parsed.source || 'AVAILABLE_FIELDS';
            
            // Backward compatibility: normalize legacy single-field format
            if (!fields && parsed.field) {
              fields = [parsed.field];
            } else if (!fields && !parsed.field) {
              // Very old format: just the field object
              fields = [parsed];
            }
            
            // Add each field to labels
            if (fields && fields.length > 0) {
              fields.forEach((field: Field) => handleLabelDrop(field, source));
            }
          } catch (err) {
            console.warn('Failed to parse dropped field for label zone', err);
          }
        }}
      >
        {labelFields.length === 0 && (
          <Typography variant="caption" sx={{ color: '#666' }}>Drop fields here to display their values as labels.</Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {labelFields.map(f => (
            <Chip
              key={f.id}
              size="small"
              label={f.columnName === '__current_measure__' ? 'Measure Value' : f.columnName}
              onDelete={() => handleRemoveFromLabel(f.id)}
            />
          ))}
        </Box>
      </Box>
      {labelsEnabled && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 500 }}>Sampling Strategy:</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            {(['auto','all','sample'] as const).map(s => (
              <Chip
                key={s}
                label={s}
                color={labelSamplingStrategy === s ? 'primary' : 'default'}
                size="small"
                onClick={() => handleStrategyChange(s)}
              />
            ))}
          </Box>
          {warningMessage && (
            <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: '#fff6e5', border: '1px solid #ffe0a3' }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>{warningMessage}</Typography>
              {canShowOverrideAll && labelSamplingStrategy !== 'all' && (
                <Chip size="small" label="Force Show" color="secondary" onClick={() => handleStrategyChange('all')} />
              )}
              {canShowOverrideAll && labelSamplingStrategy !== 'sample' && (
                <Chip size="small" label="Sample" sx={{ ml: 0.5 }} onClick={() => handleStrategyChange('sample')} />
              )}
            </Box>
          )}
        </Box>
      )}
      {/* Future: style config placeholder */}
      {labelsEnabled && (
        <Box sx={{ mt: 1 }}>
          <Tooltip title="Coming soon: font & alignment controls">
            <span>
              <IconButton size="small" disabled>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" sx={{ ml: 0.5 }}>Style options (future)</Typography>
        </Box>
      )}
    </PropertySection>
  );
};

export default LabelPanel;
