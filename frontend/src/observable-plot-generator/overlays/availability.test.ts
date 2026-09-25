// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, FieldOverrideState, UserChartType } from '../../types';
import { ChartGenerationContext } from '../types';
import { generatePlot } from '../observablePlotGenerator';
import { detectDefaultUserChartType } from '../helpers/chartTypeResolver';
import { computeOverrideTargets } from '../utils/fieldOverrides';
import { getAvailableOverlayTypes, OverlayAvailabilityInput } from './availability';
import { DEFAULT_OVERLAYS, OverlayType } from './types';

// Primary chart marks are irrelevant here: every Plot function returns an inert
// mark object, and transforms pass their options through.
jest.mock('@observablehq/plot', () => {
  const transforms = new Set([
    'stackX', 'stackY', 'windowX', 'windowY', 'pointer', 'pointerX', 'pointerY',
    'groupX', 'groupY', 'group', 'binX', 'binY', 'bin', 'dodgeX', 'dodgeY',
    'normalizeX', 'normalizeY', 'mapX', 'mapY', 'hexbin',
  ]);
  return new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '__esModule') return true;
      if (transforms.has(name)) {
        return (...args: any[]) => {
          const last = args[args.length - 1];
          return last && typeof last === 'object' ? last : {};
        };
      }
      return (data: any, opts: any) => ({ type: name, data, opts });
    },
  });
});

// Each overlay builder returns a tagged mark, so the rendered grid tells which
// overlays the generator actually applied.
jest.mock('./linearRegression', () => ({ buildLinearRegression: () => ({ overlay: 'linearRegression' }) }));
jest.mock('./movingAverage', () => ({ buildMovingAverage: () => ({ overlay: 'movingAverage' }) }));
jest.mock('./density', () => ({ buildDensity: () => ({ overlay: 'density' }) }));
jest.mock('./referenceLines', () => ({
  ...jest.requireActual('./referenceLines'),
  buildReferenceLines: () => ({ overlay: 'referenceLines' }),
}));
jest.mock('./marginalRug', () => ({ buildMarginalRug: () => ({ overlay: 'marginalRug' }) }));
jest.mock('./hexbin', () => ({
  ...jest.requireActual('./hexbin'),
  buildHexbin: () => ({ overlay: 'hexbin' }),
}));
jest.mock('./crosshair', () => ({ buildCrosshair: () => ({ overlay: 'crosshair' }) }));

const region: Field = { id: 'region', columnName: 'region', type: 'dimension', flavour: 'discrete', dataType: 'string' };
const product: Field = { id: 'product', columnName: 'product', type: 'dimension', flavour: 'discrete', dataType: 'string' };
const ts: Field = { id: 'ts', columnName: 'ts', type: 'dimension', flavour: 'continuous', dataType: 'integer' };
const value: Field = { id: 'value', columnName: 'value', type: 'measure', flavour: 'continuous', dataType: 'float', aggregation: 'sum' };
const other: Field = { id: 'other', columnName: 'other', type: 'measure', flavour: 'continuous', dataType: 'float', aggregation: 'sum' };

const rows = [
  { region: 'North', product: 'A', ts: 1, 'SUM(value)': 10, 'SUM(other)': 3 },
  { region: 'North', product: 'B', ts: 2, 'SUM(value)': 12, 'SUM(other)': 5 },
  { region: 'South', product: 'A', ts: 3, 'SUM(value)': 5, 'SUM(other)': 8 },
  { region: 'South', product: 'B', ts: 4, 'SUM(value)': 8, 'SUM(other)': 2 },
];

const LINE_OVERLAYS: OverlayType[] = ['linearRegression', 'movingAverage', 'marginalRug', 'crosshair', 'referenceLines'];
const SCATTER_OVERLAYS: OverlayType[] = ['linearRegression', 'density', 'marginalRug', 'hexbin', 'crosshair', 'referenceLines'];

interface Scenario {
  name: string;
  x: Field[];
  y: Field[];
  globalChartType?: UserChartType | null;
  fieldOverrides?: Record<string, FieldOverrideState>;
  expected: OverlayType[];
}

const SCENARIOS: Scenario[] = [
  { name: 'all-discrete axes (auto table)', x: [region], y: [product], expected: [] },
  { name: 'discrete dimension × measure (auto bar)', x: [region], y: [value], expected: [] },
  { name: 'continuous dimension × measure (auto line)', x: [ts], y: [value], expected: LINE_OVERLAYS },
  { name: 'measure × measure (auto scatter)', x: [value], y: [other], expected: SCATTER_OVERLAYS },
  { name: 'faceted line', x: [region, ts], y: [value], expected: LINE_OVERLAYS },
  { name: 'continuous field on one axis only', x: [ts], y: [], expected: [] },
  { name: 'explicit bar on continuous axes', x: [ts], y: [value], globalChartType: 'bar', expected: ['referenceLines'] },
  { name: 'explicit tick on continuous axes', x: [ts], y: [value], globalChartType: 'tick', expected: ['referenceLines'] },
  { name: 'explicit scatter on discrete axes', x: [region], y: [product], globalChartType: 'scatter', expected: [] },
  { name: 'explicit gantt', x: [ts], y: [region], globalChartType: 'gantt', expected: [] },
  { name: 'explicit heatmap', x: [region], y: [product], globalChartType: 'heatmap', expected: [] },
  { name: 'explicit pie', x: [region], y: [value], globalChartType: 'pie', expected: [] },
  { name: 'disallowed pie falls back to auto scatter', x: [value], y: [other], globalChartType: 'pie', expected: SCATTER_OVERLAYS },
  {
    name: 'per-field scatter override inside an auto line chart',
    x: [ts],
    y: [value, other],
    fieldOverrides: { other: { chartType: 'scatter' } as FieldOverrideState },
    expected: Array.from(new Set([...LINE_OVERLAYS, ...SCATTER_OVERLAYS])),
  },
];

function availabilityInput(s: Scenario): OverlayAvailabilityInput {
  return {
    xFields: s.x,
    yFields: s.y,
    globalChartType: s.globalChartType ?? null,
    fieldOverrides: s.fieldOverrides,
  };
}

/** Render the scenario the way useChartGeneration does, with every overlay enabled. */
function renderedOverlayTypes(s: Scenario): Set<OverlayType> {
  const context: ChartGenerationContext = {
    xFields: s.x,
    yFields: s.y,
    color: { field: null, scheme: '', bias: 0, reversed: false, manual: '' },
    sizeRange: [4, 20],
    manualSize: 10,
    queryResult: { columns: [], rows, row_count: rows.length },
    fieldOverrides: s.fieldOverrides,
    fieldOverrideTargets: computeOverrideTargets(s.x, s.y, []),
    globalChartType: s.globalChartType ?? detectDefaultUserChartType(s.x, s.y) ?? null,
    overlays: DEFAULT_OVERLAYS.map((o) => ({ ...o, enabled: true, hideSourceData: false })),
  };
  const found = new Set<OverlayType>();
  for (const cell of generatePlot(context).cells) {
    if (cell.content.kind !== 'plot') continue;
    for (const mark of (cell.content.options.marks ?? []) as any[]) {
      if (mark?.overlay) found.add(mark.overlay);
    }
  }
  return found;
}

const sorted = (types: Iterable<OverlayType>) => Array.from(types).sort();

describe('getAvailableOverlayTypes', () => {
  test.each(SCENARIOS)('$name', (s) => {
    expect(sorted(getAvailableOverlayTypes(availabilityInput(s)))).toEqual(sorted(s.expected));
  });
});

describe('overlay availability matches what the generator renders', () => {
  test.each(SCENARIOS)('$name', (s) => {
    expect(sorted(getAvailableOverlayTypes(availabilityInput(s)))).toEqual(sorted(renderedOverlayTypes(s)));
  });
});
