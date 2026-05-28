// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';

/**
 * Check whether the current axis field configuration allows density (KDE) mode.
 *
 * Valid layout: at least one continuous dimension on X, no continuous fields on Y,
 * and no measures on either axis. KDE consumes raw row values, so aggregated
 * measures are not meaningful here.
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
