import { TooltipField } from '../../components/Visualization/CustomTooltip/CustomTooltip';
import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Format a value for tooltip display with appropriate precision and formatting
 */
export function formatTooltipValue(val: any): string {
  if (val == null) return 'null';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return String(val);
    return Number.isInteger(val) ? val.toString() : val.toFixed(2);
  }
  if (val instanceof Date) {
    return val.toLocaleString();
  }
  return String(val);
}

/**
 * Create tooltip field configuration for chart types
 */
export function createTooltipFieldsGetter(
  mainFields: { label: string; column: string }[],
  colorField?: Field,
  sizeField?: Field,
  tooltipFields?: Field[],
  excludeColumns?: string[]
): (d: any) => TooltipField[] {
  return (d: any): TooltipField[] => {
    const fields: TooltipField[] = [];
    const exclude = new Set(excludeColumns || []);
    
    // Add main fields (e.g., X, Y, dimension, etc.)
    mainFields.forEach(({ label, column }) => {
      if (!exclude.has(column)) {
        const value = d[column];
        fields.push({ 
          label, 
          value: value,
          formattedValue: formatTooltipValue(value)
        });
      }
    });
    
    // Add color field if present
    if (colorField) {
      const colorColumnName = getResultColumnName(colorField);
      if (!exclude.has(colorColumnName)) {
        fields.push({ 
          label: colorField.columnName, 
          value: d[colorColumnName],
          formattedValue: formatTooltipValue(d[colorColumnName])
        });
        exclude.add(colorColumnName);
      }
    }
    
    // Add size field if present
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      if (!exclude.has(sizeColumnName)) {
        fields.push({ 
          label: sizeField.columnName, 
          value: d[sizeColumnName],
          formattedValue: formatTooltipValue(d[sizeColumnName])
        });
        exclude.add(sizeColumnName);
      }
    }
    
    // Add additional tooltip fields (avoid duplicates)
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        const colName = getResultColumnName(tf);
        if (colName && !exclude.has(colName)) {
          fields.push({ 
            label: tf.columnName, 
            value: d[colName],
            formattedValue: formatTooltipValue(d[colName])
          });
        }
      });
    }
    
    return fields;
  };
}

