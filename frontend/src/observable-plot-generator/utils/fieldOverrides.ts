import { Field } from '../../types';

/**
 * Target describing a field that can receive per-field chart overrides.
 */
export interface FieldOverrideTarget {
  fieldId: string;
  axis: 'x' | 'y';
  field: Field;
}

/**
 * Compute the list of fields that are eligible for per-field overrides,
 * following the rules:
 *
 * 1. When only one axis has 2 or more continuous fields: every continuous field
 *    on that axis gets an override.
 *
 * 2. When continuous fields exist on both axes AND more than 2 fields in total:
 *    all continuous fields on the axis with more continuous fields get overrides.
 *
 * 3. When both axes have the same number of continuous fields, take the fields
 *    from the X-axis for override possibility.
 */
export function computeOverrideTargets(
  xFields: Field[],
  yFields: Field[]
): FieldOverrideTarget[] {
  const isContinuous = (f: Field) =>
    f.flavour === 'continuous' && (f.type === 'dimension' || f.type === 'measure');

  const xContinuous = xFields.filter(isContinuous);
  const yContinuous = yFields.filter(isContinuous);

  const xCount = xContinuous.length;
  const yCount = yContinuous.length;
  const total = xCount + yCount;

  // No continuous fields → no overrides
  if (total === 0) {
    return [];
  }

  // Case 1: only one axis has 2+ continuous fields and the opposite has <2
  const xHasMulti = xCount >= 2 && yCount < 2;
  const yHasMulti = yCount >= 2 && xCount < 2;
  if (xHasMulti && !yHasMulti) {
    return xContinuous.map((f) => ({ fieldId: f.id, axis: 'x', field: f }));
  }
  if (yHasMulti && !xHasMulti) {
    return yContinuous.map((f) => ({ fieldId: f.id, axis: 'y', field: f }));
  }

  // Case 2/3: continuous on both axes and more than 2 in total
  if (xCount > 0 && yCount > 0 && total > 2) {
    if (xCount > yCount) {
      return xContinuous.map((f) => ({ fieldId: f.id, axis: 'x', field: f }));
    }
    if (yCount > xCount) {
      return yContinuous.map((f) => ({ fieldId: f.id, axis: 'y', field: f }));
    }
    // Same number on both axes → prefer X-axis
    return xContinuous.map((f) => ({ fieldId: f.id, axis: 'x', field: f }));
  }

  // Fallback: do not expose overrides if none of the above rules matched
  return [];
}


