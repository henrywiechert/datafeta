import { Field } from '../../../types';

/**
 * Shallow compare field id arrays (order significant).
 */
export function sameFieldArray(a: Field[], b: Field[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

