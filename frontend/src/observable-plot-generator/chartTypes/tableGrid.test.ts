import { generateTableGrid, resolveTableCellMode } from './tableGrid';
import { ChartGenerationContext } from '../types';
import { Field } from '../../types';
import { MarkGridCellModel } from '../gridModel';
import { DEFAULT_CHART_COLOR, MIN_NON_PLOT_GRID_ROW_PX } from '../../config/chartLayoutConfig';

function dimField(id: string, columnName: string, dataType: 'string' | 'integer' = 'string'): Field {
  return {
    id,
    columnName,
    type: 'dimension',
    flavour: 'discrete',
    dataType,
  };
}

function buildContext(overrides: Partial<ChartGenerationContext> & {
  rows?: any[];
  xFields?: Field[];
  yFields?: Field[];
}): ChartGenerationContext {
  const { rows = [], xFields = [], yFields = [], ...rest } = overrides;
  return {
    xFields,
    yFields,
    queryResult: { rows, columns: [], row_count: rows.length } as any,
    ...rest,
  } as ChartGenerationContext;
}

describe('generateTableGrid', () => {
  describe('resolveTableCellMode', () => {
    it("resolves 'auto' to 'symbol' in PR 6", () => {
      const ctx = buildContext({});
      expect(resolveTableCellMode(ctx, 'auto')).toBe('symbol');
    });

    it("preserves explicit 'symbol' selection", () => {
      const ctx = buildContext({});
      expect(resolveTableCellMode(ctx, 'symbol')).toBe('symbol');
    });

    it("preserves explicit 'text' selection (text rendering arrives in PR 7)", () => {
      const ctx = buildContext({});
      expect(resolveTableCellMode(ctx, 'text')).toBe('text');
    });
  });

  it('produces a 1×1 empty grid when no fields and no data are provided', () => {
    const grid = generateTableGrid(buildContext({}));
    expect(grid.layout).toEqual({
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: [MIN_NON_PLOT_GRID_ROW_PX],
    });
    expect(grid.cells).toHaveLength(1);
    expect(grid.cells[0].content.kind).toBe('empty');
    expect(grid.headers).toBeUndefined();
  });

  it('builds row × column headers from discrete dimensions on Y/X', () => {
    const region = dimField('dim-region', 'region');
    const year = dimField('dim-year', 'year', 'integer');
    const grid = generateTableGrid(buildContext({
      xFields: [year],
      yFields: [region],
      rows: [
        { region: 'East', year: 2024 },
        { region: 'East', year: 2025 },
        { region: 'West', year: 2024 },
        { region: 'West', year: 2025 },
      ],
    }));

    expect(grid.layout.rows).toBe(2);
    expect(grid.layout.columns).toBe(2);

    expect(grid.headers?.rows?.levels).toEqual([
      { fieldLabel: 'region', values: ['East', 'West'] },
    ]);
    expect(grid.headers?.cols?.levels).toEqual([
      { fieldLabel: 'year', values: [2024, 2025] },
    ]);

    expect(grid.headers?.rows?.orderedValueTuples).toEqual([['East'], ['West']]);
    expect(grid.headers?.cols?.orderedValueTuples).toEqual([[2024], [2025]]);
    expect(grid.headers?.rows?.baseSpan).toBe(1);
    expect(grid.headers?.cols?.baseSpan).toBe(1);
  });

  it('emits a single mark cell with the default chart color when there is no encoding', () => {
    const region = dimField('dim-region', 'region');
    const grid = generateTableGrid(buildContext({
      yFields: [region],
      rows: [
        { region: 'East' },
        { region: 'West' },
      ],
    }));

    expect(grid.layout.rows).toBe(2);
    expect(grid.layout.columns).toBe(1);
    const cell0 = grid.cells[0] as MarkGridCellModel;
    expect(cell0.content.kind).toBe('mark');
    expect(cell0.content.symbols).toHaveLength(1);
    expect(cell0.content.symbols[0]).toMatchObject({
      symbol: 'circle',
      color: DEFAULT_CHART_COLOR,
    });
  });

  it('renders a preview stack when a discrete color field has multiple values per cell', () => {
    const region = dimField('dim-region', 'region');
    const segment = dimField('dim-segment', 'segment');
    const grid = generateTableGrid(buildContext({
      yFields: [region],
      colorField: segment,
      colorScheme: 'tableau10',
      rows: [
        { region: 'East', segment: 'a' },
        { region: 'East', segment: 'b' },
        { region: 'West', segment: 'a' },
      ],
    }));

    // East cell should have two distinct colors (stack); West has one.
    const eastCell = grid.cells.find((c) => c.position.row === 0 && c.position.col === 0) as MarkGridCellModel;
    const westCell = grid.cells.find((c) => c.position.row === 1 && c.position.col === 0) as MarkGridCellModel;

    expect(eastCell.content.kind).toBe('mark');
    expect(eastCell.content.symbols.length).toBe(2);
    const eastColors = eastCell.content.symbols.map((s) => s.color);
    expect(new Set(eastColors).size).toBe(2);

    expect(westCell.content.kind).toBe('mark');
    expect(westCell.content.symbols.length).toBe(1);
  });

  it('emits empty cells for (rowTuple, colTuple) combinations with no matching data', () => {
    const region = dimField('dim-region', 'region');
    const year = dimField('dim-year', 'year', 'integer');
    const grid = generateTableGrid(buildContext({
      xFields: [year],
      yFields: [region],
      rows: [
        { region: 'East', year: 2024 },
        { region: 'West', year: 2025 },
      ],
    }));

    // Sparse: 2x2 grid but only diagonal cells are populated.
    expect(grid.cells).toHaveLength(4);
    const east2024 = grid.cells.find((c) => c.position.row === 0 && c.position.col === 0)!;
    const east2025 = grid.cells.find((c) => c.position.row === 0 && c.position.col === 1)!;
    const west2024 = grid.cells.find((c) => c.position.row === 1 && c.position.col === 0)!;
    const west2025 = grid.cells.find((c) => c.position.row === 1 && c.position.col === 1)!;

    expect(east2024.content.kind).toBe('mark');
    expect(west2025.content.kind).toBe('mark');
    expect(east2025.content.kind).toBe('empty');
    expect(west2024.content.kind).toBe('empty');
  });

  it('uses a manual shape from `manualShape` when no shape field is provided', () => {
    const region = dimField('dim-region', 'region');
    const grid = generateTableGrid(buildContext({
      yFields: [region],
      manualShape: 'square',
      rows: [{ region: 'East' }],
    }));

    const cell = grid.cells[0] as MarkGridCellModel;
    expect(cell.content.kind).toBe('mark');
    expect(cell.content.symbols[0].symbol).toBe('square');
  });

  it('uses compact (28px) row sizing for table cells', () => {
    const region = dimField('dim-region', 'region');
    const grid = generateTableGrid(buildContext({
      yFields: [region],
      rows: [
        { region: 'East' },
        { region: 'West' },
      ],
    }));

    expect(grid.layout.rowSizes).toEqual([MIN_NON_PLOT_GRID_ROW_PX, MIN_NON_PLOT_GRID_ROW_PX]);
    expect(grid.layout.columnSizes).toEqual(['fr']);
  });
});
