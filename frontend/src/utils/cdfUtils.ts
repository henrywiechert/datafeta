import { Field } from '../types';

/**
 * Check whether the current axis field configuration allows CDF mode.
 * CDF is valid only when:
 * - At least one continuous measure is on the X-axis
 * - No continuous field (measure or dimension) is on the Y-axis
 * - No continuous dimension is on any axis
 *
 * Measures go on X because the CDF chart renders measure values along X
 * and cumulative probability along Y.
 */
export function isCdfAllowed(xFields: Field[], yFields: Field[]): boolean {
  const hasContinuousMeasureOnX = xFields.some(
    f => f.type === 'measure' && f.flavour === 'continuous',
  );
  const hasContinuousOnY = yFields.some(f => f.flavour === 'continuous');
  const hasContinuousDimension = [...xFields, ...yFields].some(
    f => f.type === 'dimension' && f.flavour === 'continuous',
  );

  return hasContinuousMeasureOnX && !hasContinuousOnY && !hasContinuousDimension;
}
