import * as Plot from '@observablehq/plot';
import { ChartGenerationContext } from '../types';
import { BAR_STEP_PX, DEFAULT_CHART_COLOR, BAND_PADDING } from '../../config/chartLayoutConfig';
import { getResultColumnName } from '../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { computeBandPaddingFromSizeField } from './barCore';

/**
 * Tick-strip chart for a single continuous dimension.
 * Orientation rules:
 * - 'x': continuous dimension on X-axis → Plot.tickX
 * - 'y': continuous dimension on Y-axis → Plot.tickY
 */
export function tickStrip(
  context: ChartGenerationContext,
  orientation: 'x' | 'y',
  dimensionColumn: string,
  categoryDimensionColumn?: string,
  labels?: { dimension?: string; category?: string }
): Plot.PlotOptions {
  const { queryResult, colorField, colorScheme, colorBias, sizeField, sizeRange, manualSize, manualColor, tooltipFields } = context;
  const data = queryResult.rows;
  const colorInfo = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, colorBias) : null;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
  const strokeValue = colorField && colorInfo
    ? (colorInfo.kind === 'continuous' && colorInfo.accessor
        ? (d: any) => colorInfo.accessor?.(d) ?? null
        : colorColumnName)
    : (manualColor || DEFAULT_CHART_COLOR);
  const colorScale = colorField && colorInfo
    ? (colorInfo.kind === 'continuous'
        ? {
            type: 'linear',
            domain: colorInfo.domain as [number, number],
            range: colorInfo.range,
            clamp: true,
            label: colorField.columnName,
          } as any
        : {
            type: 'ordinal' as any,
            domain: colorInfo.domain as any[],
            range: colorInfo.range,
            label: colorField.columnName,
          } as any)
    : undefined;

  // Compute band padding for category axes (like bar charts)
  // This controls the "thickness" of tick marks along the category axis
  // The padding value changes with manualSize: larger size → smaller padding → thicker tick marks
  const bandPadding = computeBandPaddingFromSizeField(data, sizeField, { manualSize }) ?? BAND_PADDING;

  // Guard against invalid values; accept numbers or dates (Date objects or parseable strings)
  const isNumericOrDate = (v: any) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    v instanceof Date ||
    (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const hasValid = Array.isArray(data) && data.some((row) => isNumericOrDate(row[dimensionColumn]));
  if (!hasValid) {
    // Render empty axes so cell frame is consistent
    if (orientation === 'x') {
      return {
        x: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true } as any,
        y: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
        height: BAR_STEP_PX,
        marks: [],
      };
    } else {
      return {
        y: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true } as any,
        x: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
        width: BAR_STEP_PX,
        marks: [],
      };
    }
  }

  // Compute domain from filtered data (numbers or dates)
  const computeAxisDomain = () => {
    const values = data
      .map((row: any) => row[dimensionColumn])
      .filter((v: any) => isNumericOrDate(v));
    if (values.length === 0) return undefined;
    const sample = values[0];
    if (typeof sample === 'number') {
      const nums = values as number[];
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      return [min, max] as [number, number];
    }
    // Treat as dates
    const toDate = (v: any) => (v instanceof Date ? v : new Date(v));
    const dates = (values as any[]).map(toDate);
    const minD = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxD = new Date(Math.max(...dates.map((d) => d.getTime())));
    return [minD, maxD] as [Date, Date];
  };
  const axisDomain = computeAxisDomain();

  if (orientation === 'x') {
    if (categoryDimensionColumn) {
      const categories = Array.from(new Set(data.map((row: any) => row[categoryDimensionColumn])));
      const categoryCount = categories.length;
      // Build tick config with channels
      const tickConfig: any = {
        x: dimensionColumn,
        y: categoryDimensionColumn,
        stroke: strokeValue,
        strokeWidth: 1.5,
        channels: {}
      };
      
      // Add color field to channels for tooltip
      if (colorField && colorColumnName) {
        tickConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };
      }
      
      // Add size field to channels for tooltip
      if (sizeField) {
        const sizeColumnName = getResultColumnName(sizeField);
        tickConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
      }
      
      // Add tooltip fields to channels
      if (tooltipFields) {
        tooltipFields.forEach(tf => {
          const colName = getResultColumnName(tf);
          if (colName && !tickConfig.channels[tf.columnName]) {
            tickConfig.channels[tf.columnName] = { value: colName, label: tf.columnName };
          }
        });
      }
      
      // Use a custom title function to ensure consistent styling (like scatter charts)
      tickConfig.title = (d: any) => {
        const formatValue = (val: any): string => {
          if (typeof val === 'number' && !Number.isInteger(val)) {
            return val.toFixed(2);
          }
          return String(val);
        };
        
        const parts: string[] = [];
        parts.push(`${labels?.dimension || dimensionColumn}: ${formatValue(d[dimensionColumn])}`);
        parts.push(`${labels?.category || categoryDimensionColumn}: ${formatValue(d[categoryDimensionColumn])}`);
        if (colorField) {
          parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName!])}`);
        }
        if (sizeField) {
          const sizeColumnName = getResultColumnName(sizeField);
          parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
        }
        // Add tooltip fields
        if (tooltipFields) {
          tooltipFields.forEach(tf => {
            const colName = getResultColumnName(tf);
            if (colName && colName !== dimensionColumn && colName !== categoryDimensionColumn) {
              const colorColName = colorField ? getResultColumnName(colorField) : null;
              const sizeColName = sizeField ? getResultColumnName(sizeField) : null;
              if (colName !== colorColName && colName !== sizeColName) {
                parts.push(`${tf.columnName}: ${formatValue(d[colName])}`);
              }
            }
          });
        }
        return parts.join('\n');
      };
      
      // Build tip format
      const tipFormat: any = { stroke: false };
      if (colorField) {
        tipFormat[colorField.columnName] = true;
      }
      if (sizeField) {
        tipFormat[sizeField.columnName] = true;
      }
      // Add tooltip fields to tipFormat
      if (tooltipFields) {
        tooltipFields.forEach(tf => {
          tipFormat[tf.columnName] = true;
        });
      }
      
      tickConfig.tip = { format: tipFormat };
      
      const opts: Plot.PlotOptions = {
        x: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
        y: { 
          label: labels?.category || categoryDimensionColumn,
          domain: categories as any,
          type: 'band' as any,
          padding: bandPadding as any,
        },
        height: Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX),
        marks: [
          Plot.tickX(data, tickConfig),
        ],
      };
      if (colorScale) {
        opts.color = {
          ...(opts as any).color,
          ...colorScale,
        } as any;
      }
      return opts;
    }
    
    // Build tick config with channels
    // Map all ticks to the dummy category so band padding affects thickness
    const tickConfig: any = {
      x: dimensionColumn,
      y: () => ' ',
      stroke: strokeValue,
      strokeWidth: 1.5,
      channels: {}
    };
    
    // Add color field to channels for tooltip
    if (colorField && colorColumnName) {
      tickConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };
    }
    
    // Add size field to channels for tooltip
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      tickConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
    }
    
    // Add tooltip fields to channels
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        const colName = getResultColumnName(tf);
        if (colName && !tickConfig.channels[tf.columnName]) {
          tickConfig.channels[tf.columnName] = { value: colName, label: tf.columnName };
        }
      });
    }
    
    // Use a custom title function to ensure consistent styling (like scatter charts)
    tickConfig.title = (d: any) => {
      const formatValue = (val: any): string => {
        if (typeof val === 'number' && !Number.isInteger(val)) {
          return val.toFixed(2);
        }
        return String(val);
      };
      
      const parts: string[] = [];
      parts.push(`${labels?.dimension || dimensionColumn}: ${formatValue(d[dimensionColumn])}`);
      if (colorField) {
        parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName!])}`);
      }
      if (sizeField) {
        const sizeColumnName = getResultColumnName(sizeField);
        parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
      }
      // Add tooltip fields
      if (tooltipFields) {
        tooltipFields.forEach(tf => {
          const colName = getResultColumnName(tf);
          if (colName && colName !== dimensionColumn) {
            const colorColName = colorField ? getResultColumnName(colorField) : null;
            const sizeColName = sizeField ? getResultColumnName(sizeField) : null;
            if (colName !== colorColName && colName !== sizeColName) {
              parts.push(`${tf.columnName}: ${formatValue(d[colName])}`);
            }
          }
        });
      }
      return parts.join('\n');
    };
    
    // Build tip format
    const tipFormat: any = { stroke: false };
    if (colorField) {
      tipFormat[colorField.columnName] = true;
    }
    if (sizeField) {
      tipFormat[sizeField.columnName] = true;
    }
    // Add tooltip fields to tipFormat
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        tipFormat[tf.columnName] = true;
      });
    }
    
    tickConfig.tip = { format: tipFormat };
    
    const opts: Plot.PlotOptions = {
      x: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
      y: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
      height: BAR_STEP_PX,
      marks: [
        Plot.tickX(data, tickConfig),
      ],
    };
    if (colorScale) {
      opts.color = {
        ...(opts as any).color,
        ...colorScale,
      } as any;
    }
    return opts;
  }

  // orientation === 'y'
  if (categoryDimensionColumn) {
    const categories = Array.from(new Set(data.map((row: any) => row[categoryDimensionColumn])));
    const categoryCount = categories.length;
    // Build tick config with channels
    const tickConfig: any = {
      y: dimensionColumn,
      x: categoryDimensionColumn,
      stroke: strokeValue,
      strokeWidth: 1.5,
      channels: {}
    };
    
    // Add color field to channels for tooltip
    if (colorField && colorColumnName) {
      tickConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };
    }
    
    // Add size field to channels for tooltip
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      tickConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
    }
    
    // Add tooltip fields to channels
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        const colName = getResultColumnName(tf);
        if (colName && !tickConfig.channels[tf.columnName]) {
          tickConfig.channels[tf.columnName] = { value: colName, label: tf.columnName };
        }
      });
    }
    
    // Use a custom title function to ensure consistent styling (like scatter charts)
    tickConfig.title = (d: any) => {
      const formatValue = (val: any): string => {
        if (typeof val === 'number' && !Number.isInteger(val)) {
          return val.toFixed(2);
        }
        return String(val);
      };
      
      const parts: string[] = [];
      parts.push(`${labels?.dimension || dimensionColumn}: ${formatValue(d[dimensionColumn])}`);
      parts.push(`${labels?.category || categoryDimensionColumn}: ${formatValue(d[categoryDimensionColumn])}`);
      if (colorField) {
        parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName!])}`);
      }
      if (sizeField) {
        const sizeColumnName = getResultColumnName(sizeField);
        parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
      }
      // Add tooltip fields
      if (tooltipFields) {
        tooltipFields.forEach(tf => {
          const colName = getResultColumnName(tf);
          if (colName && colName !== dimensionColumn && colName !== categoryDimensionColumn) {
            const colorColName = colorField ? getResultColumnName(colorField) : null;
            const sizeColName = sizeField ? getResultColumnName(sizeField) : null;
            if (colName !== colorColName && colName !== sizeColName) {
              parts.push(`${tf.columnName}: ${formatValue(d[colName])}`);
            }
          }
        });
      }
      return parts.join('\n');
    };
    
    // Build tip format
    const tipFormat: any = { stroke: false };
    if (colorField) {
      tipFormat[colorField.columnName] = true;
    }
    if (sizeField) {
      tipFormat[sizeField.columnName] = true;
    }
    // Add tooltip fields to tipFormat
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        tipFormat[tf.columnName] = true;
      });
    }
    
    tickConfig.tip = { format: tipFormat };
    
    const opts: Plot.PlotOptions = {
      y: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
      x: { 
        label: labels?.category || categoryDimensionColumn,
        domain: categories as any,
        type: 'band' as any,
        padding: bandPadding as any,
      },
      width: Math.max(BAR_STEP_PX * 2, categoryCount * BAR_STEP_PX),
      marks: [
        Plot.tickY(data, tickConfig),
      ],
    };
    if (colorScale) {
      opts.color = {
        ...(opts as any).color,
        ...colorScale,
      } as any;
    }
    return opts;
  }
  // Build tick config with channels
  // Map all ticks to the dummy category so band padding affects thickness
  const tickConfig: any = {
    y: dimensionColumn,
    x: () => ' ',
    stroke: strokeValue,
    strokeWidth: 1.5,
    channels: {}
  };
  
  // Add color field to channels for tooltip
  if (colorField && colorColumnName) {
    tickConfig.channels[colorField.columnName] = { value: colorColumnName, label: colorField.columnName };
  }
  
  // Add size field to channels for tooltip
  if (sizeField) {
    const sizeColumnName = getResultColumnName(sizeField);
    tickConfig.channels[sizeField.columnName] = { value: sizeColumnName, label: sizeField.columnName };
  }
  
  // Add tooltip fields to channels
  if (tooltipFields) {
    tooltipFields.forEach(tf => {
      const colName = getResultColumnName(tf);
      if (colName && !tickConfig.channels[tf.columnName]) {
        tickConfig.channels[tf.columnName] = { value: colName, label: tf.columnName };
      }
    });
  }
  
  // Use a custom title function to ensure consistent styling (like scatter charts)
  tickConfig.title = (d: any) => {
    const formatValue = (val: any): string => {
      if (typeof val === 'number' && !Number.isInteger(val)) {
        return val.toFixed(2);
      }
      return String(val);
    };
    
    const parts: string[] = [];
    parts.push(`${labels?.dimension || dimensionColumn}: ${formatValue(d[dimensionColumn])}`);
    if (colorField) {
      parts.push(`${colorField.columnName}: ${formatValue(d[colorColumnName!])}`);
    }
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      parts.push(`${sizeField.columnName}: ${formatValue(d[sizeColumnName])}`);
    }
    // Add tooltip fields
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        const colName = getResultColumnName(tf);
        if (colName && colName !== dimensionColumn) {
          const colorColName = colorField ? getResultColumnName(colorField) : null;
          const sizeColName = sizeField ? getResultColumnName(sizeField) : null;
          if (colName !== colorColName && colName !== sizeColName) {
            parts.push(`${tf.columnName}: ${formatValue(d[colName])}`);
          }
        }
      });
    }
    return parts.join('\n');
  };
  
  // Build tip format
  const tipFormat: any = { stroke: false };
  if (colorField) {
    tipFormat[colorField.columnName] = true;
  }
  if (sizeField) {
    tipFormat[sizeField.columnName] = true;
  }
  // Add tooltip fields to tipFormat
  if (tooltipFields) {
    tooltipFields.forEach(tf => {
      tipFormat[tf.columnName] = true;
    });
  }
  
  tickConfig.tip = { format: tipFormat };
  
  const opts: Plot.PlotOptions = {
    y: { label: labels?.dimension || dimensionColumn, domainKey: dimensionColumn, grid: true, ...(axisDomain ? { domain: axisDomain as any, nice: false as any } : {}) } as any,
    x: { label: ' ', domain: [' '] as any, type: 'band' as any, padding: bandPadding as any },
    width: BAR_STEP_PX,
    marks: [
      Plot.tickY(data, tickConfig),
    ],
  };
  if (colorScale) {
    opts.color = {
      ...(opts as any).color,
      ...colorScale,
    } as any;
  }
  return opts;
}


