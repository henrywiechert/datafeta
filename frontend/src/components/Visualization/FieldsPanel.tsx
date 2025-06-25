import React from 'react';
import { Box, Typography } from '@mui/material';
import FieldChip, { DragSource } from './FieldChip/index';
import FieldsSearch from './FieldsSearch';
import { Field } from '../../types';

interface FieldsPanelProps {
  availableFields: Field[];
  fieldsSearch: string;
  onFieldsSearchChange: (search: string) => void;
  onFieldUpdate: (field: Field) => void;
  onRemoveFromAxis: (fieldId: string) => void;
}

const FieldsPanel: React.FC<FieldsPanelProps> = ({
  availableFields,
  fieldsSearch,
  onFieldsSearchChange,
  onFieldUpdate,
  onRemoveFromAxis
}) => {
  const [isFieldsPanelDragOver, setIsFieldsPanelDragOver] = React.useState(false);

  // Filter functions for reuse
  const filterBySearch = (field: Field) =>
    field.columnName.toLowerCase().includes(fieldsSearch.toLowerCase()) ||
    (field.aggregation && field.aggregation.toLowerCase().includes(fieldsSearch.toLowerCase())) ||
    (field.dataType && field.dataType.toLowerCase().includes(fieldsSearch.toLowerCase()));

  // Filtered fields for dimensions and measures
  const filteredDimensions = availableFields
    .filter(field => field.type === 'dimension')
    .filter(filterBySearch);

  const filteredMeasures = availableFields
    .filter(field => field.type === 'measure')
    .filter(filterBySearch);

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{ padding: '12px', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
        <Typography variant="h6">Fields</Typography>
        <FieldsSearch value={fieldsSearch} onChange={onFieldsSearchChange} />
      </div>
      <div 
        style={{ 
          padding: '8px', 
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: 1,
          minHeight: 0,
          backgroundColor: isFieldsPanelDragOver ? 'rgba(244, 67, 54, 0.1)' : 'transparent',
          border: isFieldsPanelDragOver ? '2px dashed #f44336' : '2px dashed transparent',
          transition: 'all 0.2s ease',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          
          // Only show visual feedback for axis fields
          try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.source === 'X_AXIS' || data.source === 'Y_AXIS') {
              setIsFieldsPanelDragOver(true);
            }
          } catch (error) {
            // Ignore parsing errors during drag over
          }
        }}
        onDragLeave={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX;
          const y = e.clientY;
          
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            setIsFieldsPanelDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsFieldsPanelDragOver(false);
          
          try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            const { field, source } = data;
            
            // Only remove if dragging from an axis (not from available fields)
            if (source === 'X_AXIS' || source === 'Y_AXIS') {
              onRemoveFromAxis(field.id);
            }
          } catch (error) {
            console.error('Error parsing drag data:', error);
          }
        }}
      >
        {/* Dimensions Section */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary', fontWeight: 'bold' }}>
            Dimensions
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {filteredDimensions.map(field => (
              <FieldChip 
                key={`${field.id}-${field.type}-${field.flavour}-${field.dataType}-${field.aggregation || 'none'}`} 
                field={field} 
                onUpdate={onFieldUpdate} 
                source="AVAILABLE_FIELDS" 
              />
            ))}
            {filteredDimensions.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                No dimensions available
              </Typography>
            )}
          </Box>
        </Box>

        {/* Measures Section */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary', fontWeight: 'bold' }}>
            Measures
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {filteredMeasures.map(field => (
              <FieldChip 
                key={`${field.id}-${field.type}-${field.flavour}-${field.dataType}-${field.aggregation || 'none'}`} 
                field={field} 
                onUpdate={onFieldUpdate} 
                source="AVAILABLE_FIELDS" 
              />
            ))}
            {filteredMeasures.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                No measures available
              </Typography>
            )}
          </Box>
        </Box>
      </div>
    </div>
  );
};

export default FieldsPanel;
