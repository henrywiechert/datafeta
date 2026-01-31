import { DragSource } from '../../../types';

export interface FieldMenuConfig {
  /** Show a context-menu action to remove the field(s) from the current zone */
  allowRemoveFromZone: boolean;

  /** Allow changing dimension/measure */
  allowTypeChange: boolean;

  /** Allow changing discrete/continuous */
  allowFlavourChange: boolean;

  /** Allow selecting a concrete data type (string/integer/float/datetime) */
  allowDataTypeChange: boolean;

  /** Allow configuring column casting */
  allowCasting: boolean;

  /** Allow measure aggregation selection */
  allowAggregationChange: boolean;

  /** Allow axis-only bar sort order controls */
  allowBarSortOrder: boolean;

  /** Allow DateTime part menu */
  allowDateTimePart: boolean;

  /** Allow creating binned fields (histogram support) - only in available fields panel */
  allowCreateBins: boolean;
}

/**
 * Default policy per zone.
 *
 * Your current preference:
 * - Non-axis zones: "full edit like axes" (except axis-only controls).
 * - Context menu removal: enabled as "Remove from this zone" (no inline delete icons).
 */
export function getDefaultFieldMenuConfig(source: DragSource): FieldMenuConfig {
  const isAxis = source === 'X_AXIS' || source === 'Y_AXIS';
  const isAvailableFields = source === 'AVAILABLE_FIELDS';

  return {
    allowRemoveFromZone: !isAvailableFields,
    allowTypeChange: true,
    allowFlavourChange: true,
    allowDataTypeChange: !isAxis,
    allowCasting: !isAxis,
    allowAggregationChange: true,
    allowBarSortOrder: isAxis,
    allowDateTimePart: true,
    allowCreateBins: isAvailableFields,
  };
}


