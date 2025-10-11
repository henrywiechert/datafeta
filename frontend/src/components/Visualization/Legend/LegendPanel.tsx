import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName, getResultColumnName } from '../../../utils/fieldUtils';
import { getSchemeById, DEFAULT_CATEGORICAL_SCHEME } from '../../../config/colorSchemes';
import styles from './LegendPanel.module.css';

interface LegendPanelProps {
  colorField: Field | null;
  queryResult: QueryResult | null;
  colorScheme?: string;
}

const LegendPanel: React.FC<LegendPanelProps> = ({
  colorField,
  queryResult,
  colorScheme = DEFAULT_CATEGORICAL_SCHEME,
}) => {
  // Extract unique values from the color field
  const legendItems = useMemo(() => {
    if (!colorField || !queryResult?.rows) {
      return [];
    }

    // Use getResultColumnName to handle DateTime parts correctly
    const columnName = getResultColumnName(colorField);
    
    // Extract unique values in ORDER OF FIRST APPEARANCE (same as Observable Plot)
    // This is critical for color consistency - Observable Plot assigns colors based on domain order
    const uniqueValues = Array.from(
      new Set(queryResult.rows.map(row => row[columnName]))
    );

    return uniqueValues;
  }, [colorField, queryResult]);

  // Get color from the selected color scheme
  const getColor = (value: any, index: number) => {
    const scheme = getSchemeById(colorScheme);
    if (!scheme) {
      // Fallback to default Tableau 10 colors
      const tableau10 = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
      return tableau10[index % tableau10.length];
    }
    
    // Observable Plot assigns colors sequentially to all domain values, including NULL
    // So we simply use the index to get the color from the scheme
    return scheme.colors[index % scheme.colors.length];
  };

  if (!colorField || legendItems.length === 0) {
    return null;
  }

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography variant="subtitle2" className={styles.title}>
          Color: {getFieldDisplayName(colorField)}
        </Typography>
      </Box>
      <Box className={styles.content}>
        {legendItems.map((value, index) => (
          <Box key={index} className={styles.legendItem}>
            <Box
              className={styles.colorSwatch}
              sx={{ backgroundColor: getColor(value, index) }}
            />
            <Typography className={styles.legendLabel}>
              {value === null || value === undefined ? 'NULL' : String(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default LegendPanel;

