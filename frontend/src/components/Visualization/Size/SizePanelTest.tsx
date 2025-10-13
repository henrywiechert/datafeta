import React from 'react';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { Field, DragSource } from '../../../types';
import { useVisualizationContext } from '../../../contexts/VisualizationContext';

const SizePanel: React.FC = () => {
  const { state, dispatch } = useVisualizationContext();

  const handleSizeDrop = (field: Field, source: DragSource) => {
    dispatch({
      type: 'SET_SIZE_FIELD',
      payload: field
    });
  };

  const handleRemoveFromSize = () => {
    dispatch({
      type: 'SET_SIZE_FIELD', 
      payload: null
    });
  };

  return (
    <div style={{ marginBottom: '16px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
      <div style={{ 
        padding: '12px 16px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        fontWeight: 'bold'
      }}>
        <PhotoSizeSelectLargeIcon fontSize="small" />
        Size
      </div>
      <div style={{ padding: '16px' }}>
        <div>Size configuration panel - Test</div>
      </div>
    </div>
  );
};

export default SizePanel;