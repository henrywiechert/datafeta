// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { TooltipField, Field } from '../../types';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { getFieldColumnName } from '../helpers/fields';
import { formatDateTimeDisplay } from '../../datetime/datetimeDisplayFormat';

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
 * Whether a field's tooltip value represents a full timestamp that should be
 * rendered as a human-readable date/time.
 *
 * Datetime fields extracted as a distinct part (e.g. hour 0-23, weekday 1-7)
 * carry small integer values, not timestamps, so they are excluded.
 */
function isDateTimeDisplayField(field?: Field): boolean {
  if (!field || field.dataType !== 'datetime') return false;
  if (field.dateTimePart && field.dateTimeMode === 'distinct') return false;
  // count/count_distinct on a datetime column produce integer counts, not timestamps.
  if (field.aggregation === 'count' || field.aggregation === 'count_distinct') return false;
  return true;
}

/**
 * Format a value for tooltip display with appropriate precision and formatting.
 *
 * Datetime values (Date instances, or raw timestamps on datetime fields) are
 * rendered as human-readable UTC strings, consistent with axis ticks and the
 * table view. Everything else keeps its numeric/string formatting.
 */
export function formatTooltipValue(val: any, sourceField?: Field): string {
  if (val == null) return 'null';
  if (val instanceof Date) {
    return formatDateTimeDisplay(val) ?? String(val);
  }
  if (isDateTimeDisplayField(sourceField)) {
    const formatted = formatDateTimeDisplay(val);
    if (formatted != null) return formatted;
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return String(val);
    return Number.isInteger(val) ? val.toString() : val.toFixed(2);
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
  facetFields?: Field[],
  shapeField?: Field
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
            formattedValue: formatTooltipValue(value, f),
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
          formattedValue: formatTooltipValue(value, sourceField),
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
          formattedValue: formatTooltipValue(value, colorField),
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
          formattedValue: formatTooltipValue(value, sizeField),
          sourceField: sizeField,
          rawValue: value,
        });
        exclude.add(sizeColumnName);
      }
    }

    // Add shape field if present
    if (shapeField) {
      const shapeColumnName = getResultColumnName(shapeField);
      if (!exclude.has(shapeColumnName)) {
        const value = d[shapeColumnName];
        fields.push({
          label: tooltipLabel(shapeField),
          value: value,
          formattedValue: formatTooltipValue(value, shapeField),
          sourceField: shapeField,
          rawValue: value,
        });
        exclude.add(shapeColumnName);
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
            formattedValue: formatTooltipValue(value, tf),
            sourceField: tf,
            rawValue: value,
          });
        }
      });
    }
    
    return fields;
  };
}

