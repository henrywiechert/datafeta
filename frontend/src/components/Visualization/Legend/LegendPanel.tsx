import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../../../observable-plot-generator/utils/colorSchemeUtils';
import { DEFAULT_CATEGORICAL_SCHEME } from '../../../config/colorSchemes';
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
  const colorScale = useMemo(() => {
    if (!colorField || !queryResult?.rows) {
      return null;
    }
    return deriveColorScaleInfo(queryResult.rows, colorField, colorScheme);
  }, [colorField, colorScheme, queryResult]);

  const formatValue = (value: any): string => {
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
  };

  const discreteItems = useMemo(() => {
    if (!colorField || !colorScale || colorScale.kind !== 'categorical') {
      return [] as Array<{ label: string; color: string }>;
    }
    const domain = Array.isArray(colorScale.domain) ? colorScale.domain : [];
    const range = colorScale.range;
    return domain.map((value, index) => ({
      label: formatValue(value),
      color: range[index % range.length],
    }));
  }, [colorField, colorScale]);

  const continuousLegend = useMemo(() => {
    if (!colorField || !colorScale || colorScale.kind !== 'continuous' || colorScale.range.length === 0) {
      return null;
    }
    const domain = colorScale.domain as [number, number];
    const gradient = `linear-gradient(to right, ${colorScale.range.join(', ')})`;
    const minLabel = formatValue(colorScale.rawMin ?? domain[0]);
    const maxLabel = formatValue(colorScale.rawMax ?? domain[1]);
    return {
      gradient,
      minLabel,
      maxLabel,
    };
  }, [colorField, colorScale]);

  if (!colorField || (!discreteItems.length && !continuousLegend)) {
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
        {continuousLegend ? (
          <Box className={styles.gradientLegend}>
            <Box className={styles.gradientBar} sx={{ backgroundImage: continuousLegend.gradient }} />
            <Box className={styles.gradientLabels}>
              <Typography className={styles.gradientLabel}>{continuousLegend.minLabel}</Typography>
              <Typography className={styles.gradientLabel}>{continuousLegend.maxLabel}</Typography>
            </Box>
          </Box>
        ) : (
          discreteItems.map((item, index) => (
            <Box key={`${item.label}-${index}`} className={styles.legendItem}>
              <Box
                className={styles.colorSwatch}
                sx={{ backgroundColor: item.color }}
              />
              <Typography className={styles.legendLabel}>
                {item.label}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

export default LegendPanel;

