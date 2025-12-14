import React, { useMemo } from 'react';
import { Typography, Box } from '@mui/material';
import FieldChip from './FieldChip/index';
import { Field } from '../../types';
import styles from './FieldsPanel.module.css';

interface FieldCategoryProps {
  title: string;
  fields: Field[];
  onUpdate: (fields: Field | Field[]) => void;
}

const FieldCategory: React.FC<FieldCategoryProps> = ({ title, fields, onUpdate }) => {
  // Memoize fields to pass to FieldChip
  const allFields = useMemo(() => fields, [fields]);
  
  return (
    <Box className={styles.fieldCategory}>
      <Typography variant="subtitle2" className={styles.categoryTitle}>
        {title}
      </Typography>
      <Box className={styles.fieldsContainer}>
        {fields.map(field => (
          <FieldChip 
            key={field.id} 
            field={field} 
            onUpdate={onUpdate}
            source="AVAILABLE_FIELDS"
            allFields={allFields}
          />
        ))}
        {fields.length === 0 && (
          <Typography variant="body2" className={styles.emptyMessage}>
            No {title.toLowerCase()} available
          </Typography>
        )}
      </Box>
    </Box>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
// Only re-render if title, fields array, or onUpdate callback changes
export default React.memo(FieldCategory, (prevProps, nextProps) => {
  // Custom comparison: only re-render if actual props change
  return (
    prevProps.title === nextProps.title &&
    prevProps.fields === nextProps.fields &&
    prevProps.onUpdate === nextProps.onUpdate
  );
});
