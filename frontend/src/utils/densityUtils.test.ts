// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';
import { isDensityAllowed, resolveDensityQueryField } from './densityUtils';

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

  it('allows continuous measures on X when no continuous dimensions are present', () => {
    expect(isDensityAllowed([meas('revenue')], [])).toBe(true);
  });

  it('rejects mixed continuous dimensions and measures', () => {
    expect(isDensityAllowed([dim('age', 'continuous'), meas('revenue')], [])).toBe(false);
  });
});

describe('resolveDensityQueryField', () => {
  it('maps a binned virtual column back to its source field', () => {
    const binned = dim('Revenue_bin', 'discrete');
    const resolved = resolveDensityQueryField(binned, [{
      name: 'Revenue_bin',
      expression: 'FLOOR("Revenue" / 100) * 100',
      binConfig: { name: 'Revenue_bin', sourceField: 'Revenue', binWidth: 100 },
    }]);

    expect(resolved.columnName).toBe('Revenue');
    expect(resolved.is_virtual).toBe(false);
  });
});
