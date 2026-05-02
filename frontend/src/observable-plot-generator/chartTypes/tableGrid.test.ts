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

  describe('symbol size encoding', () => {
    // `MarkSymbolSpec.size` is Plot-style symbol area (π · r²), where `r` is
    // the notional radius the size shelf works in.
    const areaForRadius = (r: number) => Math.PI * r * r;

    it('uses manualSize as the symbol radius when no size field is configured', () => {
      const region = dimField('dim-region', 'region');
      const grid = generateTableGrid(buildContext({
        yFields: [region],
        manualSize: 12,
        rows: [{ region: 'East' }],
      }));

      const cell = grid.cells[0] as MarkGridCellModel;
      expect(cell.content.kind).toBe('mark');
      expect(cell.content.symbols).toHaveLength(1);
      expect(cell.content.symbols[0].size).toBeCloseTo(areaForRadius(12), 5);
    });

    it('produces different symbol sizes for cells driven by a continuous size field', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region],
        sizeField: sales,
        sizeRange: [4, 20],
        manualSize: 8,
        rows: [
          { region: 'East', 'SUM(sales)': 100 },
          { region: 'West', 'SUM(sales)': 1000 },
        ],
      }));

      const eastCell = grid.cells.find((c) => c.position.row === 0) as MarkGridCellModel;
      const westCell = grid.cells.find((c) => c.position.row === 1) as MarkGridCellModel;

      expect(eastCell.content.kind).toBe('mark');
      expect(westCell.content.kind).toBe('mark');
      // East has the smaller value, so it must render with the smaller area.
      expect(eastCell.content.symbols[0].size).toBeLessThan(westCell.content.symbols[0].size);
      // The size scale should hit the endpoints of `sizeRange`.
      expect(eastCell.content.symbols[0].size).toBeCloseTo(areaForRadius(4), 5);
      expect(westCell.content.symbols[0].size).toBeCloseTo(areaForRadius(20), 5);
    });

    it('falls back to a sensible default radius when manualSize is missing', () => {
      const region = dimField('dim-region', 'region');
      const grid = generateTableGrid(buildContext({
        yFields: [region],
        rows: [{ region: 'East' }],
      }));

      const cell = grid.cells[0] as MarkGridCellModel;
      expect(cell.content.kind).toBe('mark');
      // Default radius is 8 → ~201 area; matches the legacy DEFAULT_MARK_AREA.
      expect(cell.content.symbols[0].size).toBeCloseTo(areaForRadius(8), 0);
    });

    it('encodes a continuous color field (measure on color) to per-cell colors', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region],
        colorField: sales,
        colorScheme: 'tableau10',
        rows: [
          { region: 'East', 'SUM(sales)': 100 },
          { region: 'West', 'SUM(sales)': 1000 },
        ],
      }));

      const eastCell = grid.cells.find((c) => c.position.row === 0) as MarkGridCellModel;
      const westCell = grid.cells.find((c) => c.position.row === 1) as MarkGridCellModel;

      expect(eastCell.content.kind).toBe('mark');
      expect(westCell.content.kind).toBe('mark');
      // Continuous color must produce *different* colors for different values
      // (regression: previously only categorical color scales were honored).
      expect(eastCell.content.symbols[0].color).not.toBe(westCell.content.symbols[0].color);
      // Both must be real colors, not the default chart color fallback.
      expect(eastCell.content.symbols[0].color).not.toBe(DEFAULT_CHART_COLOR);
      expect(westCell.content.symbols[0].color).not.toBe(DEFAULT_CHART_COLOR);
    });

    it('takes the largest encoded size when multiple rows share a (symbol, color) bucket', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const grid = generateTableGrid(buildContext({
        yFields: [region],
        sizeField: sales,
        sizeRange: [4, 20],
        manualSize: 8,
        // Two rows in the same cell with the same fingerprint but different
        // sales values. Dedup picks the larger size.
        rows: [
          { region: 'East', 'SUM(sales)': 100 },
          { region: 'East', 'SUM(sales)': 1000 },
        ],
      }));

      const cell = grid.cells[0] as MarkGridCellModel;
      expect(cell.content.kind).toBe('mark');
      expect(cell.content.symbols).toHaveLength(1);
      expect(cell.content.symbols[0].size).toBeCloseTo(areaForRadius(20), 5);
    });
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

  describe('pagination (PR 8)', () => {
    /**
     * Build a deterministic 5-row / 1-col data set so we can assert which
     * row-tuples appear on each page.
     */
    function buildPagedContext(extra: Partial<ChartGenerationContext> = {}): ChartGenerationContext {
      const region = dimField('dim-region', 'region');
      const year = dimField('dim-year', 'year', 'integer');
      const rows = [
        { region: 'A', year: 2020 },
        { region: 'B', year: 2020 },
        { region: 'C', year: 2020 },
        { region: 'D', year: 2020 },
        { region: 'E', year: 2020 },
      ];
      return buildContext({
        xFields: [year],
        yFields: [region],
        rows,
        ...extra,
      });
    }

    it('omits pagination metadata when tablePageSize is not set', () => {
      const grid = generateTableGrid(buildPagedContext());
      expect(grid.pagination).toBeUndefined();
      // Unpaged: all 5 row-tuples should be present.
      expect(grid.layout.rows).toBe(5);
    });

    it('omits pagination metadata when tablePageSize is zero or negative', () => {
      const zero = generateTableGrid(buildPagedContext({ tablePageSize: 0, tablePage: 0 }));
      const negative = generateTableGrid(buildPagedContext({ tablePageSize: -10, tablePage: 0 }));
      expect(zero.pagination).toBeUndefined();
      expect(negative.pagination).toBeUndefined();
      expect(zero.layout.rows).toBe(5);
      expect(negative.layout.rows).toBe(5);
    });

    it('slices row-tuples to the first page when tablePage is 0', () => {
      const grid = generateTableGrid(buildPagedContext({ tablePageSize: 2, tablePage: 0 }));
      expect(grid.pagination).toEqual({ totalRowTuples: 5, pageSize: 2, page: 0 });
      expect(grid.layout.rows).toBe(2);
      expect(grid.headers?.rows?.levels[0].values).toEqual(['A', 'B']);
      // 2 rows × 1 col = 2 cells.
      expect(grid.cells).toHaveLength(2);
    });

    it('slices row-tuples to a middle page', () => {
      const grid = generateTableGrid(buildPagedContext({ tablePageSize: 2, tablePage: 1 }));
      expect(grid.pagination).toEqual({ totalRowTuples: 5, pageSize: 2, page: 1 });
      expect(grid.headers?.rows?.levels[0].values).toEqual(['C', 'D']);
    });

    it('returns a partial last page when totalRowTuples is not divisible by pageSize', () => {
      const grid = generateTableGrid(buildPagedContext({ tablePageSize: 2, tablePage: 2 }));
      expect(grid.pagination).toEqual({ totalRowTuples: 5, pageSize: 2, page: 2 });
      // Only one row-tuple ('E') remains on page 2.
      expect(grid.layout.rows).toBe(1);
      expect(grid.headers?.rows?.levels[0].values).toEqual(['E']);
    });

    it('clamps an out-of-range page index to the last valid page', () => {
      const grid = generateTableGrid(buildPagedContext({ tablePageSize: 2, tablePage: 99 }));
      // 5 row-tuples / pageSize 2 → 3 pages → last valid page index is 2.
      expect(grid.pagination).toEqual({ totalRowTuples: 5, pageSize: 2, page: 2 });
      expect(grid.headers?.rows?.levels[0].values).toEqual(['E']);
    });

    it('treats a negative page index as 0', () => {
      const grid = generateTableGrid(buildPagedContext({ tablePageSize: 2, tablePage: -3 }));
      expect(grid.pagination).toEqual({ totalRowTuples: 5, pageSize: 2, page: 0 });
      expect(grid.headers?.rows?.levels[0].values).toEqual(['A', 'B']);
    });

    it('reports totalRowTuples even when the page is past the data', () => {
      const grid = generateTableGrid(buildPagedContext({ tablePageSize: 100, tablePage: 0 }));
      expect(grid.pagination?.totalRowTuples).toBe(5);
      // Page size larger than data → all rows on a single page.
      expect(grid.layout.rows).toBe(5);
    });

    it('only paginates row-tuples (columns are unaffected)', () => {
      const region = dimField('dim-region', 'region');
      const year = dimField('dim-year', 'year', 'integer');
      const rows = [
        { region: 'A', year: 2020 }, { region: 'A', year: 2021 },
        { region: 'B', year: 2020 }, { region: 'B', year: 2021 },
        { region: 'C', year: 2020 }, { region: 'C', year: 2021 },
      ];
      const grid = generateTableGrid(buildContext({
        xFields: [year],
        yFields: [region],
        rows,
        tablePageSize: 2,
        tablePage: 0,
      }));
      // 2 row-tuples × 2 col-tuples = 4 cells; the col axis is not sliced.
      expect(grid.layout.rows).toBe(2);
      expect(grid.layout.columns).toBe(2);
      expect(grid.cells).toHaveLength(4);
      expect(grid.headers?.cols?.levels[0].values).toEqual([2020, 2021]);
    });

    it('preserves pagination semantics for text-mode cells', () => {
      const region = dimField('dim-region', 'region');
      const sales = measureField('m-sales', 'sales');
      const rows = [
        { region: 'A', 'SUM(sales)': 10 },
        { region: 'B', 'SUM(sales)': 20 },
        { region: 'C', 'SUM(sales)': 30 },
      ];
      const grid = generateTableGrid(buildContext({
        yFields: [region],
        xFields: [sales],
        rows,
        tableCellMode: 'text',
        tablePageSize: 2,
        tablePage: 1,
      }));
      // 2nd page contains only 'C' → 1 row-tuple × 1 col-tuple = 1 cell.
      expect(grid.pagination).toEqual({ totalRowTuples: 3, pageSize: 2, page: 1 });
      expect(grid.layout.rows).toBe(1);
      expect(grid.cells).toHaveLength(1);
      const cell = grid.cells[0] as TextGridCellModel;
      expect(cell.content.kind).toBe('text');
      expect(cell.content.rows[0].value).toBe('30');
    });
  });
});
