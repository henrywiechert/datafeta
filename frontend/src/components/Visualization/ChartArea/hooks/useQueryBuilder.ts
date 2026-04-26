/**
 * useQueryBuilder Hook
 * 
 * Responsible for building QueryDescription from field configurations
 * and generating optimization hints. Extracted from useQueryExecution
 * for separation of concerns.
 */

import { useMemo } from 'react';
import { buildQuery } from '../../../../queryBuilder/queryBuilder';
import { QueryDescription, Field, OptimizationHints, VirtualTableDefinition, VirtualColumnDefinition, QueryOptimizationSettings, UserChartType, DistributionVariant } from '../../../../types';
import { generateOptimizationHintsFromFields } from '../../../../services/optimizationHintGenerator';
import { buildViewSpec, ViewSpec } from '../../../../viewPlanner';

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
  measureGroupFields?: Field[];
  measureValuesSourceFields?: Field[];
  fieldOverrides?: Record<string, import('../../../../types').FieldOverrideState>;
  independentDomains?: { x?: boolean; y?: boolean };
  /** Connection type (e.g., 'clickhouse', 'csv') - used for validation */
  connectionType?: string;
  optimizationSettings?: QueryOptimizationSettings;
  /** Global chart type — used to detect CDF query mode */
  globalChartType?: UserChartType;
  distributionVariant?: DistributionVariant;
}

export interface UseQueryBuilderReturn {
  /** The built query description, or null if insufficient fields */
  queryDescription: QueryDescription | null;
  /** Generated optimization hints for the query */
  optimizationHints: OptimizationHints | null;
  /** Canonical internal view description used for planning diagnostics. */
  viewSpec: ViewSpec | null;
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
  measureGroupFields = [],
  measureValuesSourceFields = [],
  fieldOverrides = {},
  independentDomains,
  connectionType,
  optimizationSettings,
  globalChartType,
  distributionVariant = 'tick-strip',
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

  const viewSpec = useMemo((): ViewSpec | null => {
    if (xAxisFields.length === 0 && yAxisFields.length === 0) {
      return null;
    }

    return buildViewSpec({
      xAxisFields,
      yAxisFields,
      filterConfigurations,
      colorField,
      sizeField,
      shapeField,
      facetBackgroundField,
      labelFields,
      tooltipFields,
      measureGroupFields,
      measureValuesSourceFields,
      additionalColorFields,
      additionalSizeFields,
      additionalLabelFields,
      fieldOverrides,
      globalChartType,
      distributionVariant,
      independentDomains,
    });
  }, [
    xAxisFields,
    yAxisFields,
    filterConfigurations,
    colorField,
    sizeField,
    shapeField,
    facetBackgroundField,
    labelFields,
    tooltipFields,
    measureGroupFields,
    measureValuesSourceFields,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
    fieldOverrides,
    globalChartType,
    distributionVariant,
    independentDomains,
  ]);

  // Build the query description from the canonical view spec.
  const queryDescription = useMemo((): QueryDescription | null => {
    console.log('🔧 currentQueryDescription recalculating with virtualTable:', virtualTable);
    const plannedFields = viewSpec?.queryFields || [];
    // Validate we have sufficient fields
    if (plannedFields.length === 0 || !selectedTable) {
      return null;
    }

    // For ClickHouse, database is required; for CSV, it's not
    if (connectionType === 'clickhouse' && !selectedDatabase) {
      return null;
    }

    // Build the query
    const queryDesc = buildQuery({
      fields: plannedFields,
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
      distributionVariant,
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
        viewSpec: viewSpec
          ? {
              grain: viewSpec.grain,
              queryMode: viewSpec.queryMode,
              paneRows: viewSpec.panePartition.rows.map(f => f.columnName),
              paneColumns: viewSpec.panePartition.columns.map(f => f.columnName),
            }
          : null,
      });

      if (process.env.NODE_ENV === 'development' && viewSpec) {
        const actualMode = queryDesc.query_mode || (queryDesc.measures?.length ? 'aggregated' : 'raw');
        if (actualMode !== viewSpec.queryMode) {
          console.warn('[ViewPlanner] Query mode mismatch', {
            planned: viewSpec.queryMode,
            actual: actualMode,
          });
        }
      }

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
    colorField,
    sizeField,
    filterConfigurations,
    labelFields,
    tooltipFields,
    optimizationHints,
    virtualTable,
    virtualColumns,
    connectionType,
    globalChartType,
    distributionVariant,
    xAxisFields,
    yAxisFields,
    viewSpec,
  ]);

  return {
    queryDescription,
    optimizationHints,
    viewSpec,
  };
};

