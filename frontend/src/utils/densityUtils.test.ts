// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';
import { resolveBinnedFieldToSource } from './binningUtils';
import { isDensityAllowed } from './densityUtils';

function dim(columnName: string, flavour: 'discrete' | 'continuous' = 'discrete'): Field {
  return {
    id: `dim-${columnName}`,
    columnName,
    type: 'dimension',
    flavour,
    dataType: flavour === 'continuous' ? 'float' : 'string',
  } as Field;
}

function meas(columnName: string): Field {
  return {
    id: `meas-${columnName}`,
    columnName,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'float',
    aggregation: 'sum',
  } as Field;
}

describe('isDensityAllowed', () => {
  it('allows a continuous dimension on X with no measures', () => {
    expect(isDensityAllowed([dim('age', 'continuous')], [])).toBe(true);
  });

  it('rejects continuous fields on Y', () => {
    expect(isDensityAllowed([dim('region')], [dim('age', 'continuous')])).toBe(false);
  });

  it('rejects continuous measures on X (raw rows only, no aggregation)', () => {
    expect(isDensityAllowed([meas('revenue')], [])).toBe(false);
  });

  it('rejects mixed continuous dimensions and measures', () => {
    expect(isDensityAllowed([dim('age', 'continuous'), meas('revenue')], [])).toBe(false);
  });

  it('rejects a discrete-only X with no continuous dimension', () => {
    expect(isDensityAllowed([dim('region')], [])).toBe(false);
  });
});

describe('resolveBinnedFieldToSource (via density use-case)', () => {
  it('maps a binned virtual column back to its source field', () => {
    const binned = dim('Revenue_bin', 'discrete');
    const resolved = resolveBinnedFieldToSource(binned, [{
      name: 'Revenue_bin',
      expression: 'FLOOR("Revenue" / 100) * 100',
      binConfig: { name: 'Revenue_bin', sourceField: 'Revenue', binWidth: 100 },
    }]);

    expect(resolved.columnName).toBe('Revenue');
    expect(resolved.is_virtual).toBe(false);
  });

  it('returns the field unchanged when no matching virtual column exists', () => {
    const plain = dim('age', 'continuous');
    expect(resolveBinnedFieldToSource(plain, [])).toBe(plain);
    expect(resolveBinnedFieldToSource(plain)).toBe(plain);
  });
});
