// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Axis-field disable: planner filters disabled pills once; chart-type auto-detect
 * and query/render consumers must see the active axes only.
 */
import { detectDefaultChartTypeForPair, detectDefaultUserChartType } from '../../observable-plot-generator/helpers/chartTypeResolver';
import { Field } from '../../types';
import { activeAxisFields, buildViewSpec } from '../buildViewSpec';

const field = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

const measure = (columnName: string, overrides?: Partial<Field>): Field =>
  field(columnName, {
    type: 'measure',
    flavour: 'continuous',
    dataType: 'float',
    aggregation: 'sum',
    ...overrides,
  });

describe('activeAxisFields', () => {
  it('drops disabled fields and keeps the rest in order', () => {
    const a = field('a');
    const b = field('b', { disabled: true });
    const c = field('c');
    expect(activeAxisFields([a, b, c]).map((f) => f.columnName)).toEqual(['a', 'c']);
  });
});

describe('axis field disable → chart type', () => {
  it('flips measure-vs-measure scatter to bar when one measure is disabled', () => {
    const sales = measure('sales');
    const profit = measure('profit');

    const both = buildViewSpec({
      xAxisFields: [sales],
      yAxisFields: [profit],
      colorField: null,
      sizeField: null,
    });
    expect(detectDefaultChartTypeForPair(both.axes.x[0], both.axes.y[0])).toBe('scatter');
    expect(detectDefaultUserChartType(both.axes.x, both.axes.y)).toBe('scatter');

    const oneDisabled = buildViewSpec({
      xAxisFields: [sales],
      yAxisFields: [{ ...profit, disabled: true }],
      colorField: null,
      sizeField: null,
    });
    // Only sales remains on X; no Y → univariate measure fallback is bar
    expect(oneDisabled.axes.y).toEqual([]);
    expect(detectDefaultUserChartType(oneDisabled.axes.x, oneDisabled.axes.y)).toBe('bar');
  });

  it('flips two-measure shelf to category+measure bar when the second measure is disabled', () => {
    const category = field('category');
    const sales = measure('sales');
    const profit = measure('profit');

    const withBothMeasures = buildViewSpec({
      xAxisFields: [category, sales],
      yAxisFields: [profit],
      colorField: null,
      sizeField: null,
    });
    // Continuous candidates: sales (x) vs profit (y) → scatter
    expect(
      detectDefaultUserChartType(withBothMeasures.axes.x, withBothMeasures.axes.y),
    ).toBe('scatter');

    const profitDisabled = buildViewSpec({
      xAxisFields: [category, sales],
      yAxisFields: [{ ...profit, disabled: true }],
      colorField: null,
      sizeField: null,
    });
    // Remaining: discrete category + measure on X → bar (via tick/bar heuristics)
    expect(profitDisabled.axes.y).toEqual([]);
    expect(
      detectDefaultUserChartType(profitDisabled.axes.x, profitDisabled.axes.y),
    ).toBe('bar');
  });
});
