import React from 'react';
import { Typography, Box } from '@mui/material';
import FieldChip from './FieldChip/index';
import { Field } from '../../types';
import styles from './FieldsPanel.module.css';

interface FieldCategoryProps {
  title: string;
  fields: Field[];
  onUpdate: (field: Field) => void;
}

const FieldCategory: React.FC<FieldCategoryProps> = ({ title, fields, onUpdate }) => {
  return (
    <Box className={styles.fieldCategory}>
      <Typography variant="subtitle2" className={styles.categoryTitle}>
        {title}
      </Typography>
      <Box className={styles.fieldsContainer}>
        {fields.map(field => (
          <FieldChip 
            key={`${field.id}-${field.type}-${field.flavour}-${field.dataType}-${field.aggregation || 'none'}-${field.dateTimePart || 'none'}-${field.dateTimeMode || 'none'}`} 
            field={field} 
            onUpdate={onUpdate} 
            source="AVAILABLE_FIELDS" 
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

export default FieldCategory;
