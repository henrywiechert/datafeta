/**
 * useQueryBuilder Hook
 * 
 * Responsible for building QueryDescription from field configurations
 * and generating optimization hints. Extracted from useQueryExecution
 * for separation of concerns.
 */

import { useMemo } from 'react';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition, VirtualColumnDefinition, QueryOptimizationSettings, UserChartType } from '../../../../types';
import { generateOptimizationHintsFromFields } from '../../../../services/optimizationHintGenerator';
import { createQueryAffectingConfig, getQueryAffectingSingleFields } from '../../../../utils/queryAffectingConfig';

export interface UseQueryBuilderProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField: Field | null;
  shapeField?: Field | null;
  facetBackgroundField?: Field | null;
  filterConfigurations: Record<string, any>;
  labelFields: Field[];
  tooltipFields: Field[];
  virtualTable: VirtualTableDefinition | null;
  virtualColumns: VirtualColumnDefinition[];
  additionalColorFields: Field[];
  additionalSizeFields: Field[];
  additionalLabelFields: Field[];
  /** Connection type (e.g., 'clickhouse', 'csv') - used for validation */
  connectionType?: string;
  optimizationSettings?: QueryOptimizationSettings;
  /** Global chart type — used to detect CDF query mode */
  globalChartType?: UserChartType;
}

export interface UseQueryBuilderReturn {
  /** The built query description, or null if insufficient fields */
  queryDescription: QueryDescription | null;
  /** Generated optimization hints for the query */
  optimizationHints: OptimizationHints | null;
}

/**
 * Determine default aggregation for a field based on its flavour.
 */
function defaultAggregationFor(field: Field): string {
  return field.flavour === 'continuous' ? 'sum' : 'count';
}

/**
 * Check if any field in the list has an aggregation.
 */
function hasAggregatedMeasures(fields: Field[]): boolean {
  return fields.some(f => f.type === 'measure' && f.aggregation);
}

/**
 * Normalize a measure field to have a default aggregation if needed.
 */
function normalizeFieldWithDefaultAgg(
  field: Field,
  needsDefaultAgg: boolean,
  referenceFields: Field[]
): Field {
  if (
    field.type === 'measure' &&
    !field.aggregation &&
    needsDefaultAgg &&
    hasAggregatedMeasures(referenceFields)
  ) {
    return { ...field, aggregation: 'sum' as any };
  }
  return field;
}

/**
 * Hook to build query descriptions and generate optimization hints.
 */
export const useQueryBuilder = ({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField,
  shapeField,
  facetBackgroundField,
  filterConfigurations,
  labelFields,
  tooltipFields,
  virtualTable,
  virtualColumns,
  additionalColorFields,
  additionalSizeFields,
  additionalLabelFields,
  connectionType,
  optimizationSettings,
  globalChartType,
}: UseQueryBuilderProps): UseQueryBuilderReturn => {
  
  // Generate optimization hints based on field configuration
  const optimizationHints = useMemo((): OptimizationHints | null => {
    if (xAxisFields.length === 0 && yAxisFields.length === 0) {
      console.log('⚠️ No fields present, skipping optimization hints generation');
      return null;
    }

    try {
      console.log('🔧 Generating optimization hints for fields:', {
        xFields: xAxisFields.map(f => ({ name: f.columnName, type: f.type, flavour: f.flavour })),
        yFields: yAxisFields.map(f => ({ name: f.columnName, type: f.type, flavour: f.flavour })),
        color: colorField?.columnName,
        size: sizeField?.columnName,
      });

      const hints = generateOptimizationHintsFromFields({
        xAxisFields,
        yAxisFields,
        colorField,
        sizeField,
        userPreference: 'auto',
        roundingSettings: optimizationSettings
          ? {
              enabled: optimizationSettings.enableRounding,
              thresholds: {
                light: optimizationSettings.roundingThresholdLight,
                balanced: optimizationSettings.roundingThresholdBalanced,
                aggressive: optimizationSettings.roundingThresholdAggressive,
              },
            }
          : undefined,
      });

      console.log('✅ Generated hints:', {
        field_hints: hints.field_hints?.length || 0,
        enable_global_distinct: hints.enable_global_distinct,
        level: hints.optimization_level,
      });

      return hints;
    } catch (error) {
      console.error('❌ Failed to generate optimization hints:', error);
      return null;
    }
  }, [xAxisFields, yAxisFields, colorField, sizeField, optimizationSettings]);

  // Build the query description from field configuration
  const queryDescription = useMemo((): QueryDescription | null => {
    console.log('🔧 currentQueryDescription recalculating with virtualTable:', virtualTable);

    const queryAffectingConfig = createQueryAffectingConfig({
      xAxisFields,
      yAxisFields,
      appliedFilterConfigurations: filterConfigurations,
      colorField,
      sizeField,
      shapeField,
      facetBackgroundField,
      labelFields,
      tooltipFields,
    });

    // Tag fields with their axis for query optimization
    const taggedXFields = queryAffectingConfig.xAxisFields.map(f => ({ ...f, axis: 'x' as const }));
    const taggedYFields = queryAffectingConfig.yAxisFields.map(f => ({ ...f, axis: 'y' as const }));

    // If measures are present on exactly one axis, the intent is an aggregated chart.
    // Ensure axis-measures have a default aggregation.
    const xHasMeasure = taggedXFields.some(f => f.type === 'measure');
    const yHasMeasure = taggedYFields.some(f => f.type === 'measure');
    const shouldDefaultAxisMeasureAgg = xHasMeasure !== yHasMeasure;

    const normalizedXFields = shouldDefaultAxisMeasureAgg && xHasMeasure
      ? taggedXFields.map((f: any) => (
          f.type === 'measure' && !f.aggregation 
            ? { ...f, aggregation: defaultAggregationFor(f) } 
            : f
        ))
      : taggedXFields;

    const normalizedYFields = shouldDefaultAxisMeasureAgg && yHasMeasure
      ? taggedYFields.map((f: any) => (
          f.type === 'measure' && !f.aggregation 
            ? { ...f, aggregation: defaultAggregationFor(f) } 
            : f
        ))
      : taggedYFields;

    const allFields: Field[] = [...normalizedXFields, ...normalizedYFields];
    const axisFields = [
      ...queryAffectingConfig.xAxisFields,
      ...queryAffectingConfig.yAxisFields,
    ];

    for (const { key, field } of getQueryAffectingSingleFields(queryAffectingConfig)) {
      if (key === 'facetBackgroundField') {
        if (!allFields.some(f => f.columnName === field.columnName)) {
          allFields.push(field);
        }
        continue;
      }

      const entry = normalizeFieldWithDefaultAgg(field, true, axisFields);
      if (key === 'shapeField') {
        if (!allFields.some(f => f.columnName === entry.columnName)) {
          allFields.push(entry);
        }
        continue;
      }

      allFields.push(entry);
    }

    // Include additional color fields from per-field overrides
    for (const addlColorField of additionalColorFields) {
      if (!allFields.some(f => f.id === addlColorField.id)) {
        const colorEntry = normalizeFieldWithDefaultAgg(addlColorField, true, axisFields);
        allFields.push(colorEntry);
      }
    }

    // Include additional size fields from per-field overrides
    for (const addlSizeField of additionalSizeFields) {
      if (!allFields.some(f => f.id === addlSizeField.id)) {
        const sizeEntry = normalizeFieldWithDefaultAgg(addlSizeField, true, axisFields);
        allFields.push(sizeEntry);
      }
    }

    // Include additional label fields from per-field overrides
    for (const addlLabelField of additionalLabelFields) {
      if (!allFields.some(f => f.id === addlLabelField.id)) {
        const labelEntry = normalizeFieldWithDefaultAgg(addlLabelField, true, axisFields);
        allFields.push(labelEntry);
      }
    }

    // Merge label fields (without axis tagging) so query builder can include them
    const mergedFields = [...allFields];
    for (const lf of labelFields) {
      const isDuplicate = mergedFields.some(
        f => f.columnName === lf.columnName && 
             f.dateTimePart === lf.dateTimePart && 
             f.dateTimeMode === lf.dateTimeMode
      );
      if (!isDuplicate) {
        mergedFields.push(lf);
      }
    }

    // Validate we have sufficient fields
    if (mergedFields.length === 0 || !selectedTable) {
      return null;
    }

    // For ClickHouse, database is required; for CSV, it's not
    if (connectionType === 'clickhouse' && !selectedDatabase) {
      return null;
    }

    // Build the query
    const queryDesc = buildQuery({
      fields: mergedFields,
      selectedTable,
      selectedDatabase: selectedDatabase || undefined,
      filterConfigurations,
      labelFields,
      tooltipFields,
      virtualTable,
      virtualColumns,
      globalChartType,
      xAxisFields,
      yAxisFields,
      colorField,
    });

    if (queryDesc) {
      console.log('🧪 Query build (memo):', {
        dimensions: queryDesc.dimensions?.map(d => d.field),
        measures: queryDesc.measures?.map(m => m.alias || m.field),
        label_fields: (queryDesc as any).label_fields,
        colorField: colorField?.columnName,
        sizeField: sizeField?.columnName,
        virtualTable: virtualTable
          ? {
              mode: virtualTable.mode,
              unionTables: virtualTable.union_tables?.length || 0,
              joinedTables: virtualTable.joined_tables?.length || 0,
            }
          : null,
      });

      // Attach optimization hints to the query description
      if (optimizationHints) {
        queryDesc.optimization_hints = optimizationHints;
        console.log('✅ Attached optimization hints to query:', {
          field_hints_count: optimizationHints.field_hints?.length || 0,
          enable_global_distinct: optimizationHints.enable_global_distinct,
          optimization_level: optimizationHints.optimization_level,
        });
      } else {
        console.log('⚠️ No optimization hints generated for this query');
      }
    }

    return queryDesc;
  }, [
    selectedTable,
    selectedDatabase,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    shapeField,
    facetBackgroundField,
    filterConfigurations,
    labelFields,
    tooltipFields,
    optimizationHints,
    virtualTable,
    virtualColumns,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
    connectionType,
    globalChartType,
  ]);

  return {
    queryDescription,
    optimizationHints,
  };
};

