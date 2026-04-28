import { generateTableGrid, resolveTableCellMode } from './tableGrid';
import { ChartGenerationContext } from '../types';
import { Field } from '../../types';
import { MarkGridCellModel, TextGridCellModel } from '../gridModel';
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

/**
 * Helper for measure fields. Pass the raw underlying column name (e.g. `sales`);
 * the aggregation alias (`SUM(sales)`) is computed by `getFieldColumnName`.
 */
function measureField(id: string, columnName: string, aggregation: 'sum' | 'count' | 'max' = 'sum'): Field {
  return {
    id,
    columnName,
    type: 'measure',
    flavour: 'continuous',
    dataType: 'integer',
    aggregation,
  } as Field;
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
    it("resolves 'auto' to 'symbol' when no measure or label field is configured", () => {
      const ctx = buildContext({});
      expect(resolveTableCellMode(ctx, 'auto')).toBe('symbol');
    });

    it("resolves 'auto' to 'text' when a measure is on the X shelf", () => {
      const sales = measureField('m-sales', 'sales');
      const ctx = buildContext({ xFields: [sales] });
      expect(resolveTableCellMode(ctx, 'auto')).toBe('text');
    });

    it("resolves 'auto' to 'text' when a measure is on the Y shelf", () => {
      const sales = measureField('m-sales', 'sales');
      const ctx = buildContext({ yFields: [sales] });
      expect(resolveTableCellMode(ctx, 'auto')).toBe('text');
    });

    it("resolves 'auto' to 'text' when a label field is configured", () => {
      const note = dimField('dim-note', 'note');
      const ctx = buildContext({ labelFields: [note] } as any);
      expect(resolveTableCellMode(ctx, 'auto')).toBe('text');
    });

    it("preserves explicit 'symbol' selection even when measures are present", () => {
      const sales = measureField('m-sales', 'sales');
      const ctx = buildContext({ xFields: [sales] });
      expect(resolveTableCellMode(ctx, 'symbol')).toBe('symbol');
    });

    it("preserves explicit 'text' selection even when no measure or label is present", () => {
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

  describe('text mode (PR 7)', () => {
    it("auto-resolves to text when a measure is present and emits one row per cell", () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region, sales],
        rows: [
          { region: 'East', 'SUM(sales)': 1234 },
          { region: 'West', 'SUM(sales)': 5678.5 },
        ],
        tableCellMode: 'auto',
      }));

      expect(grid.cells).toHaveLength(2);
      const east = grid.cells[0] as TextGridCellModel;
      expect(east.content.kind).toBe('text');
      expect(east.content.rows).toEqual([
        { source: 'measure', label: 'SUM(sales)', value: '1234' },
      ]);
      const west = grid.cells[1] as TextGridCellModel;
      expect(west.content.rows).toEqual([
        { source: 'measure', label: 'SUM(sales)', value: '5678.50' },
      ]);
    });

    it('stacks rows from labelFields and measures in shelf order', () => {
      const region = dimField('dim-region', 'region');
      const note = dimField('dim-note', 'note');
      const sales = measureField('m-sales', 'sales');
      const profit = measureField('m-profit', 'profit');
      const grid = generateTableGrid(buildContext({
        yFields: [region, sales],
        xFields: [profit],
        labelFields: [note],
        rows: [
          { region: 'East', note: 'flagship', 'SUM(sales)': 10, 'SUM(profit)': 2 },
        ],
        tableCellMode: 'text',
      } as any));

      const cell = grid.cells[0] as TextGridCellModel;
      expect(cell.content.kind).toBe('text');
      // Order must be: labelFields first, then xField measures, then yField measures.
      expect(cell.content.rows).toEqual([
        { source: 'label', label: 'note', value: 'flagship' },
        { source: 'measure', label: 'SUM(profit)', value: '2' },
        { source: 'measure', label: 'SUM(sales)', value: '10' },
      ]);
    });

    it('emits an empty cell for (rowTuple, colTuple) combinations with no matching aggregated row', () => {
      const region = dimField('dim-region', 'region');
      const year = dimField('dim-year', 'year', 'integer');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        xFields: [year],
        yFields: [region, sales],
        rows: [
          { region: 'East', year: 2024, 'SUM(sales)': 100 },
          { region: 'West', year: 2025, 'SUM(sales)': 200 },
        ],
        tableCellMode: 'text',
      }));

      // 2x2 grid; only diagonal is populated.
      expect(grid.cells).toHaveLength(4);
      const east2024 = grid.cells.find((c) => c.position.row === 0 && c.position.col === 0)!;
      const east2025 = grid.cells.find((c) => c.position.row === 0 && c.position.col === 1)!;
      const west2024 = grid.cells.find((c) => c.position.row === 1 && c.position.col === 0)!;
      const west2025 = grid.cells.find((c) => c.position.row === 1 && c.position.col === 1)!;

      expect(east2024.content.kind).toBe('text');
      expect(west2025.content.kind).toBe('text');
      expect(east2025.content.kind).toBe('empty');
      expect(west2024.content.kind).toBe('empty');
    });

    it('skips text rows for missing/null measure values and renders only present ones', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const profit = measureField('m-profit', 'profit');
      const grid = generateTableGrid(buildContext({
        yFields: [region, sales, profit],
        rows: [
          { region: 'East', 'SUM(sales)': 100, 'SUM(profit)': null },
        ],
        tableCellMode: 'text',
      }));

      const cell = grid.cells[0] as TextGridCellModel;
      expect(cell.content.kind).toBe('text');
      expect(cell.content.rows).toEqual([
        { source: 'measure', label: 'SUM(sales)', value: '100' },
      ]);
    });

    it('formats Date measure values via toLocaleString', () => {
      const region = dimField('dim-region', 'region');
      const lastSeen = measureField('m-last-seen', 'lastSeen', 'max');
      const date = new Date('2026-04-28T12:00:00Z');
      const grid = generateTableGrid(buildContext({
        yFields: [region, lastSeen],
        rows: [
          { region: 'East', 'MAX(lastSeen)': date },
        ],
        tableCellMode: 'text',
      }));

      const cell = grid.cells[0] as TextGridCellModel;
      expect(cell.content.kind).toBe('text');
      expect(cell.content.rows).toHaveLength(1);
      expect(cell.content.rows[0].value).toBe(date.toLocaleString());
    });

    it('respects an explicit symbol selection even when measures would auto-resolve to text', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region, sales],
        rows: [{ region: 'East', 'SUM(sales)': 100 }],
        tableCellMode: 'symbol',
      }));

      const cell = grid.cells[0] as MarkGridCellModel;
      expect(cell.content.kind).toBe('mark');
    });

    it('uses fieldAliasLookup for the row label when present', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region, sales],
        rows: [{ region: 'East', 'SUM(sales)': 100 }],
        tableCellMode: 'text',
        // Alias lookup is keyed by the field's bare `columnName`, matching
        // `fieldDisplayAliases` in DataSourceContext.
        fieldAliasLookup: { sales: 'Total Sales' },
      } as any));

      const cell = grid.cells[0] as TextGridCellModel;
      expect(cell.content.rows[0].label).toBe('Total Sales');
    });

    it('falls back to the aggregation-prefixed label when no alias is set', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region, sales],
        rows: [{ region: 'East', 'SUM(sales)': 100 }],
        tableCellMode: 'text',
      }));

      const cell = grid.cells[0] as TextGridCellModel;
      expect(cell.content.rows[0].label).toBe('SUM(sales)');
    });
  });
});
