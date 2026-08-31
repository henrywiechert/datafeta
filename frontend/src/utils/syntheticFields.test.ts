// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  generateSyntheticFields,
  createMembersFromAllMeasures,
  getMeasureMemberIdentity,
  getMeasureMemberLabel,
  migrateLegacyMeasureGroup,
} from './syntheticFields';
import { Field } from '../types';

const buildField = (overrides: Partial<Field>): Field => ({
  id: overrides.id || 'field-id',
  columnName: overrides.columnName || 'col',
  type: overrides.type || 'measure',
  flavour: overrides.flavour || 'continuous',
  dataType: overrides.dataType || 'float',
  ...overrides,
});

describe('syntheticFields', () => {
  it('generates synthetic fields whenever measures exist', () => {
    const baseFields = [
      buildField({ id: 'm1', columnName: 'Revenue', type: 'measure' }),
      buildField({ id: 'm2', columnName: 'Profit', type: 'measure' }),
      buildField({ id: 'd1', columnName: 'Region', type: 'dimension', flavour: 'discrete' }),
    ];

    const synthetic = generateSyntheticFields(baseFields);

    expect(synthetic).toHaveLength(2);
    expect(synthetic[0].syntheticType).toBe('MeasureNames');
    expect(synthetic[1].syntheticType).toBe('MeasureValues');
  });

  it('generates no synthetic fields without measures', () => {
    const baseFields = [
      buildField({ id: 'd1', columnName: 'Region', type: 'dimension', flavour: 'discrete', dataType: 'string' }),
    ];

    expect(generateSyntheticFields(baseFields)).toHaveLength(0);
  });

  it('creates fresh member instances for all measures', () => {
    const fields = [
      buildField({ id: 'm1', columnName: 'Revenue', type: 'measure' }),
      buildField({ id: 'm2', columnName: 'Profit', type: 'measure' }),
      buildField({ id: 'd1', columnName: 'Region', type: 'dimension', flavour: 'discrete' }),
    ];

    const members = createMembersFromAllMeasures(fields);

    expect(members.map((m) => m.columnName)).toEqual(['Revenue', 'Profit']);
    expect(members.map((m) => m.id)).not.toContain('m1');
    expect(members.map((m) => m.id)).not.toContain('m2');
  });

  it('computes aggregation-qualified member identities', () => {
    const member = buildField({ id: 'm1', columnName: 'Sales', aggregation: 'avg' });
    expect(getMeasureMemberIdentity(member)).toBe('AVG(Sales)');
    // Missing aggregation defaults to sum
    expect(getMeasureMemberIdentity(buildField({ id: 'm2', columnName: 'Sales', aggregation: undefined }))).toBe('SUM(Sales)');
  });

  it('labels members plainly unless the column is duplicated in the group', () => {
    const sumSales = buildField({ id: 'a', columnName: 'Sales', aggregation: 'sum' });
    const avgSales = buildField({ id: 'b', columnName: 'Sales', aggregation: 'avg' });
    const profit = buildField({ id: 'c', columnName: 'Profit', aggregation: 'sum' });

    expect(getMeasureMemberLabel(profit, [sumSales, avgSales, profit])).toBe('Profit');
    expect(getMeasureMemberLabel(sumSales, [sumSales, avgSales, profit])).toBe('SUM(Sales)');
    expect(getMeasureMemberLabel(avgSales, [sumSales, avgSales, profit])).toBe('AVG(Sales)');
  });

  it('prefers displayAlias for member labels', () => {
    const aliased = buildField({ id: 'a', columnName: 'Sales', aggregation: 'sum', displayAlias: 'Total Sales' });
    const avgSales = buildField({ id: 'b', columnName: 'Sales', aggregation: 'avg' });
    expect(getMeasureMemberLabel(aliased, [aliased, avgSales])).toBe('Total Sales');
  });

  it('migrates a legacy flat field list keeping field ids', () => {
    const legacy = [
      buildField({ id: 'legacy-1', columnName: 'Revenue' }),
      buildField({ id: 'legacy-2', columnName: 'Profit' }),
    ];

    const group = migrateLegacyMeasureGroup(legacy);

    expect(group.members.map((m) => m.id)).toEqual(['legacy-1', 'legacy-2']);
    expect(group.id).toBeTruthy();
    expect(group.name).toBeTruthy();
  });
});
