// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, VirtualColumnDefinition } from '../types';
import { isBinnedField } from './binningUtils';

/**
 * Check whether the current axis field configuration allows density (KDE) mode.
 *
 * Valid layouts:
 * - One or more continuous dimensions on X, no measures (raw-row KDE).
 * - One or more continuous measures on X, no continuous dimensions (CDF-like layout,
 *   but rendered from raw rows rather than a CDF query).
 */
export function isDensityAllowed(xFields: Field[], yFields: Field[]): boolean {
  const hasContinuousOnY = yFields.some((f) => f.flavour === 'continuous');
  if (hasContinuousOnY) return false;

  const continuousOnX = xFields.filter((f) => f.flavour === 'continuous');
  if (continuousOnX.length === 0) return false;

  const hasContinuousDimension = [...xFields, ...yFields].some(
    (f) => f.type === 'dimension' && f.flavour === 'continuous',
  );
  const hasMeasures = [...xFields, ...yFields].some((f) => f.type === 'measure');

  if (hasContinuousDimension) {
    return !hasMeasures;
  }

  return xFields.some((f) => f.type === 'measure' && f.flavour === 'continuous');
}

/** Continuous fields on X that each become a density small-multiple. */
export function getDensityFieldsOnX(xFields: Field[]): Field[] {
  return xFields.filter((f) => f.flavour === 'continuous');
}

/**
 * For binned virtual columns, prefer the underlying raw source field in queries
 * so KDE runs on unbinned values.
 */
export function resolveDensityQueryField(
  field: Field,
  virtualColumns?: VirtualColumnDefinition[],
): Field {
  const vc = virtualColumns?.find(
    (column) => column.name === field.columnName || column.binConfig?.name === field.columnName,
  );
  if (vc && isBinnedField(vc) && vc.binConfig) {
    return {
      ...field,
      columnName: vc.binConfig.sourceField,
      is_virtual: false,
    };
  }
  return field;
}
