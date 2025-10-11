import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName, getResultColumnName } from '../../../utils/fieldUtils';
import styles from './LegendPanel.module.css';

interface LegendPanelProps {
  colorField: Field | null;
  queryResult: QueryResult | null;
}

const LegendPanel: React.FC<LegendPanelProps> = ({
  colorField,
  queryResult,
}) => {
  // Extract unique values from the color field
  const legendItems = useMemo(() => {
    if (!colorField || !queryResult?.rows) {
      return [];
    }

    // Use getResultColumnName to handle DateTime parts correctly
    const columnName = getResultColumnName(colorField);
    const uniqueValues = Array.from(
      new Set(queryResult.rows.map(row => row[columnName]))
    ).filter(val => val !== null && val !== undefined);

    // Sort values for consistent display
    // Smart sorting: if all values are numeric, sort numerically; otherwise sort as strings
    try {
      const allNumeric = uniqueValues.every(v => typeof v === 'number' && !Number.isNaN(v));
      if (allNumeric) {
        uniqueValues.sort((a, b) => (a as number) - (b as number));
      } else if (typeof uniqueValues[0] === 'string') {
        uniqueValues.sort((a, b) => String(a).localeCompare(String(b)));
      } else {
        uniqueValues.sort((a, b) => {
          return a < b ? -1 : a > b ? 1 : 0;
        });
      }
    } catch (e) {
      // If sorting fails, keep original order
    }

    return uniqueValues;
  }, [colorField, queryResult]);

  // Get color from Observable Plot's color scheme
  const getColor = (value: any, index: number) => {
    // Observable Plot's Paired scheme (12 colors)
    const pairedColors = [
      '#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c',
      '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'
    ];
    
    return pairedColors[index % pairedColors.length];
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
              {String(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default LegendPanel;

