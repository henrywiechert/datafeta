import { TooltipField, Field } from '../../types';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { getFieldColumnName } from '../helpers/fields';

/**
 * Build a tooltip-specific label for a field.
 * For measures with an aggregation, appends the aggregation: "myVar(sum)".
 * For dimensions or fields without aggregation, returns the plain display name.
 */
function tooltipLabel(field: Field, aliasLookup?: Record<string, string>): string {
  const base = getFieldDisplayName(field, aliasLookup);
  if (field.type === 'measure' && field.aggregation) {
    return `${base}(${field.aggregation})`;
  }
  return base;
}

/**
 * Enhance a pre-computed label with aggregation info from a sourceField.
 * When the sourceField is a measure with an aggregation and the label doesn't
 * already contain the aggregation suffix, the suffix is appended.
 */
function enrichLabelWithAggregation(label: string, sourceField?: Field): string {
  if (sourceField?.type === 'measure' && sourceField.aggregation) {
    const suffix = `(${sourceField.aggregation})`;
    if (!label.endsWith(suffix)) {
      return `${label}${suffix}`;
    }
  }
  return label;
}

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
 * 
 * @param mainFields - Primary fields to show (e.g., X, Y, dimension).
 *   Each entry may optionally carry the originating `sourceField` so that
 *   downstream consumers (e.g. filter-from-tooltip) have full metadata.
 * @param colorField - Optional color encoding field
 * @param sizeField - Optional size encoding field
 * @param tooltipFields - Additional user-selected tooltip fields
 * @param excludeColumns - Columns to exclude from tooltip
 * @param facetFields - Fields used for faceting (shown at top of tooltip for context)
 */
export function createTooltipFieldsGetter(
  mainFields: { label: string; column: string; sourceField?: Field }[],
  colorField?: Field,
  sizeField?: Field,
  tooltipFields?: Field[],
  excludeColumns?: string[],
  facetFields?: Field[]
): (d: any) => TooltipField[] {
  return (d: any): TooltipField[] => {
    const fields: TooltipField[] = [];
    const exclude = new Set(excludeColumns || []);
    
    // Add facet fields first (at top for context)
    if (facetFields && facetFields.length > 0) {
      facetFields.forEach((f) => {
        const colName = getFieldColumnName(f);
        if (!exclude.has(colName)) {
          const value = d[colName];
          fields.push({
            label: getFieldDisplayName(f),
            value: value,
            formattedValue: formatTooltipValue(value),
            sourceField: f,
            rawValue: value,
          });
          exclude.add(colName);
        }
      });
    }
    
    // Add main fields (e.g., X, Y, dimension, etc.)
    mainFields.forEach(({ label, column, sourceField }) => {
      if (!exclude.has(column)) {
        const value = d[column];
        fields.push({ 
          label: enrichLabelWithAggregation(label, sourceField), 
          value: value,
          formattedValue: formatTooltipValue(value),
          sourceField,
          rawValue: value,
        });
      }
    });
    
    // Add color field if present
    if (colorField) {
      const colorColumnName = getResultColumnName(colorField);
      if (!exclude.has(colorColumnName)) {
        const value = d[colorColumnName];
        fields.push({ 
          label: tooltipLabel(colorField), 
          value: value,
          formattedValue: formatTooltipValue(value),
          sourceField: colorField,
          rawValue: value,
        });
        exclude.add(colorColumnName);
      }
    }
    
    // Add size field if present
    if (sizeField) {
      const sizeColumnName = getResultColumnName(sizeField);
      if (!exclude.has(sizeColumnName)) {
        const value = d[sizeColumnName];
        fields.push({ 
          label: tooltipLabel(sizeField), 
          value: value,
          formattedValue: formatTooltipValue(value),
          sourceField: sizeField,
          rawValue: value,
        });
        exclude.add(sizeColumnName);
      }
    }
    
    // Add additional tooltip fields (avoid duplicates)
    if (tooltipFields) {
      tooltipFields.forEach(tf => {
        const colName = getResultColumnName(tf);
        if (colName && !exclude.has(colName)) {
          const value = d[colName];
          fields.push({ 
            label: tooltipLabel(tf), 
            value: value,
            formattedValue: formatTooltipValue(value),
            sourceField: tf,
            rawValue: value,
          });
        }
      });
    }
    
    return fields;
  };
}

