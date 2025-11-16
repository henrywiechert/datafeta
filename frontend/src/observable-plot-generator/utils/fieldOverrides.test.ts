import { Field } from '../../types';
import { computeOverrideTargets } from './fieldOverrides';

function makeField(id: string, axis: 'x' | 'y', flavour: 'continuous' | 'discrete'): Field {
  return {
    id,
    columnName: id,
    type: axis === 'x' ? 'dimension' : 'dimension',
    aggregation: undefined,
    flavour,
    dataType: 'float',
    axis,
  } as any;
}

describe('computeOverrideTargets', () => {
  it('returns empty when no continuous fields', () => {
    const x: Field[] = [makeField('x1', 'x', 'discrete')];
    const y: Field[] = [makeField('y1', 'y', 'discrete')];
    const targets = computeOverrideTargets(x, y);
    expect(targets).toHaveLength(0);
  });

  it('selects all continuous fields on single multi-continuous axis', () => {
    const x: Field[] = [makeField('x1', 'x', 'continuous'), makeField('x2', 'x', 'continuous')];
    const y: Field[] = [makeField('y1', 'y', 'discrete')];
    const targets = computeOverrideTargets(x, y);
    expect(targets.map((t) => t.fieldId).sort()).toEqual(['x1', 'x2']);
    expect(new Set(targets.map((t) => t.axis))).toEqual(new Set(['x']));
  });

  it('when both axes have continuous and total>2, picks axis with more fields', () => {
    const x: Field[] = [makeField('x1', 'x', 'continuous'), makeField('x2', 'x', 'continuous')];
    const y: Field[] = [makeField('y1', 'y', 'continuous')];
    const targets = computeOverrideTargets(x, y);
    expect(targets.map((t) => t.fieldId).sort()).toEqual(['x1', 'x2']);
    expect(new Set(targets.map((t) => t.axis))).toEqual(new Set(['x']));
  });

  it('when both axes have same number of continuous fields, prefers X-axis', () => {
    const x: Field[] = [makeField('x1', 'x', 'continuous')];
    const y: Field[] = [makeField('y1', 'y', 'continuous')];
    const targets = computeOverrideTargets(x, y);
    expect(targets.map((t) => t.fieldId)).toEqual(['x1']);
    expect(targets[0].axis).toBe('x');
  });
});

