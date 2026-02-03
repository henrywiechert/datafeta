import React, { useMemo } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { getSchemeById, categoricalSchemes } from '../../../config/colorSchemes';
import { getFieldColumnName } from '../../../observable-plot-generator/helpers/fields';
import styles from './LegendPanel.module.css';

interface BackgroundLegendPanelProps {
  backgroundField: Field | null;
  queryResult: QueryResult | null;
  colorScheme?: string;
  opacity?: number;
}

/**
 * Legend panel for facet background coloring.
 * Shows the categorical color mapping for the background field with opacity applied.
 */
const BackgroundLegendPanel: React.FC<BackgroundLegendPanelProps> = ({
  backgroundField,
  queryResult,
  colorScheme = 'tableau10',
  opacity = 0.12,
}) => {
  const legendItems = useMemo(() => {
    if (!backgroundField || !queryResult?.rows) {
      return [];
    }

    // Get unique values from the data
    const col = getFieldColumnName(backgroundField);
    const seen = new Set<string>();
    const values: any[] = [];
    
    for (const row of queryResult.rows) {
      const v = row[col];
      const key = String(v);
      if (!seen.has(key)) {
        seen.add(key);
        values.push(v);
      }
    }

    // Sort values for consistent ordering
    try {
      const allNumeric = values.every(v => typeof v === 'number' && !Number.isNaN(v));
      if (allNumeric) {
        values.sort((a, b) => a - b);
      } else {
        values.sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
      }
    } catch {
      // ignore sort errors
    }

    // Get color scheme
    const scheme = getSchemeById(colorScheme) || categoricalSchemes[0];
    const colors = scheme.colors;

    // Map values to colors with opacity
    return values.map((value, index) => {
      const baseColor = colors[index % colors.length];
      return {
        label: formatValue(value),
        color: baseColor,
        opacity,
      };
    });
  }, [backgroundField, queryResult, colorScheme, opacity]);

  if (!backgroundField || legendItems.length === 0) {
    return null;
  }

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography variant="subtitle2" className={styles.title}>
          Background: {getFieldDisplayName(backgroundField)}
        </Typography>
      </Box>
      <Box className={styles.content}>
        {legendItems.map((item, index) => (
          <Box key={`${item.label}-${index}`} className={styles.legendItem}>
            <Box
              className={styles.colorSwatch}
              sx={{ 
                backgroundColor: item.color,
                opacity: item.opacity,
              }}
            />
            <Tooltip title={item.label} placement="right" arrow enterDelay={800}>
              <Typography className={styles.legendLabel}>
                {item.label}
              </Typography>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

function formatValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'number') {
    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
    return formatter.format(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

export default BackgroundLegendPanel;
