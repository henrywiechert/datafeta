// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';

/**
 * Check whether the current axis field configuration allows density (KDE) mode.
 *
 * Valid layout: at least one continuous dimension on X, no continuous fields on Y,
 * and no measures on either axis. KDE consumes raw row values, so aggregated
 * measures are not meaningful here.
 *
 * Note: Binned virtual columns are discrete by design and must be placed on a
 * facet axis (row/col facet, or alongside a continuous dim on X/Y) rather than
 * directly on the value axis. They will not trigger density mode on their own.
 */
export function isDensityAllowed(xFields: Field[], yFields: Field[]): boolean {
  const hasContinuousOnY = yFields.some((f) => f.flavour === 'continuous');
  if (hasContinuousOnY) return false;

  const hasMeasures = [...xFields, ...yFields].some((f) => f.type === 'measure');
  if (hasMeasures) return false;

  return xFields.some((f) => f.type === 'dimension' && f.flavour === 'continuous');
}

/** Continuous fields on X that each become a density small-multiple. */
export function getDensityFieldsOnX(xFields: Field[]): Field[] {
  return xFields.filter((f) => f.flavour === 'continuous');
}
