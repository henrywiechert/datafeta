// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { QueryExecutionOrchestrator, QueryExecutionOrchestratorInput } from './queryExecutionOrchestrator';
import { apiService } from '../apiService';
import { duckdbService } from './duckdbService';
import { columnCacheManager } from './columnCacheManager';
import { filterTierManager } from './filterTierManager';
import { queryDecisionEngine, QueryDecision } from './queryDecisionEngine';

// Mock Worker for JSDOM
class Worker {
  url: string;
  onmessage: (msg: any) => void;
  constructor(stringUrl: string) {
    this.url = stringUrl;
    this.onmessage = () => {};
  }
  postMessage(msg: any) {
    this.onmessage(msg);
  }
  terminate() {}
}
(global as any).Worker = Worker;

// Mock dependencies
jest.mock('@duckdb/duckdb-wasm', () => ({
  AsyncDuckDB: jest.fn(),
  ConsoleLogger: jest.fn(),
  LogLevel: { WARNING: 0 },
}));

jest.mock('../apiService');
jest.mock('./duckdbService');
jest.mock('./columnCacheManager');
jest.mock('./filterTierManager');
jest.mock('./queryDecisionEngine');
jest.mock('./localSqlBuilder', () => ({
  applyPointBudgetSql: jest.fn((sql) => sql),
  applyLineBudgetSql: jest.fn((sql) => sql),
  buildAggregateSql: jest.fn(() => 'SELECT agg FROM table'),
  buildDuckDbDateTimePartSelectItem: jest.fn(),
  buildSelectSql: jest.fn(() => 'SELECT * FROM table'),
}));

describe('QueryExecutionOrchestrator', () => {
  let orchestrator: QueryExecutionOrchestrator;
  let mockApiService: any;
  let mockDuckDBService: any;
  let mockColumnCacheManager: any;
  let mockFilterTierManager: any;
  let mockQueryDecisionEngine: any;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    mockApiService = apiService;
    mockDuckDBService = duckdbService;
    mockColumnCacheManager = columnCacheManager;
    mockFilterTierManager = filterTierManager;
    mockQueryDecisionEngine = queryDecisionEngine;

    // Default mock implementation
    mockDuckDBService.isReady = true;

    orchestrator = new QueryExecutionOrchestrator({
      apiService: mockApiService,
      duckdbService: mockDuckDBService,
      columnCacheManager: mockColumnCacheManager,
      filterTierManager: mockFilterTierManager,
      queryDecisionEngine: mockQueryDecisionEngine,
    });
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  const mockInput: QueryExecutionOrchestratorInput = {
    viewQueryDesc: { target_table: 'test_table', dimensions: [], measures: [] } as any,
    fetchQueryDesc: { target_table: 'test_table' } as any,
    selectedTable: 'test_table',
    selectedDatabase: 'test_db',
    filterConfigurations: {},
    requiredColumns: ['col1'],
    requiresAggregation: false,
    dimensions: [],
    baseFilterConfigs: {},
    refinementFilterConfigs: {},
    pointBudget: { isPointChart: false, maxPoints: 1000, minPerStratum: 10 },
  };

  test('should fallback to backend when DuckDB is not ready', async () => {
    mockDuckDBService.isReady = false;
    const expectedResult = { rows: [], columns: [], row_count: 0 };
    mockApiService.executeQueryArrow.mockResolvedValue(expectedResult);

    const result = await orchestrator.execute(mockInput);

    expect(result.result).toBe(expectedResult);
    expect(mockApiService.executeQueryArrow).toHaveBeenCalledWith(mockInput.viewQueryDesc, undefined);
    expect(mockQueryDecisionEngine.decide).not.toHaveBeenCalled();
  });

  test('should execute local query on cache hit', async () => {
    const decision: QueryDecision = {
      strategy: 'cache_hit',
      requiresBackendQuery: false,
      baseFilterHash: 'hash123',
      reason: 'test',
    };
    mockQueryDecisionEngine.decide.mockResolvedValue(decision);
    mockColumnCacheManager.getCacheTableName.mockReturnValue('cached_table');
    mockFilterTierManager.buildRefinementWhereClause.mockReturnValue('WHERE x > 1');
    
    mockDuckDBService.query.mockResolvedValue({
      columns: ['col1'],
      rows: [{ col1: 1 }],
    });

    const result = await orchestrator.execute(mockInput);

    expect(result.decision).toBe(decision);
    expect(result.result.local_query).toBe(true);
    expect(mockDuckDBService.query).toHaveBeenCalled();
    expect(mockApiService.executeQueryArrow).not.toHaveBeenCalled();
  });

  test('should fetch raw columns and cache them when strategy is raw_columns', async () => {
    const decision: QueryDecision = {
      strategy: 'raw_columns',
      requiresBackendQuery: true,
      baseFilterHash: 'hash123',
      reason: 'test',
    };
    mockQueryDecisionEngine.decide.mockResolvedValue(decision);
    
    const mockArrowTable = {
      numRows: 2,
      schema: {
        fields: [
          { name: 'col1', type: { typeId: 2 } }, // Mock Type.Int
        ],
      },
      getChild: jest.fn((colName) => {
        if (colName === 'col1') {
          return {
            get: jest.fn((index) => index * 10),
          };
        }
        return null;
      }),
    } as any;

    const arrowResult = {
      arrowTable: mockArrowTable,
      columns: [{ name: 'col1', type: 'int' }],
      rowCount: 2,
      querySql: 'SELECT * FROM remote',
    };
    mockApiService.executeQueryArrowRaw.mockResolvedValue(arrowResult);

    const result = await orchestrator.execute(mockInput);

    expect(result.decision).toBe(decision);
    expect(mockApiService.executeQueryArrowRaw).toHaveBeenCalled();
    expect(mockColumnCacheManager.cacheColumns).toHaveBeenCalledWith(
      'test_table',
      'test_db',
      'hash123',
      arrowResult.arrowTable
    );
    expect(result.result.rows).toHaveLength(2);
    expect(result.result.rows[0]).toEqual({ col1: 0 });
    expect(result.result.rows[1]).toEqual({ col1: 10 });
  });

  test('should fetch raw columns, cache, and locally aggregate if aggregation required', async () => {
    const decision: QueryDecision = {
      strategy: 'raw_columns',
      requiresBackendQuery: true,
      baseFilterHash: 'hash123',
      reason: 'test',
    };
    mockQueryDecisionEngine.decide.mockResolvedValue(decision);
    
    // Simulate successful fetch
    const arrowResult = {
      arrowTable: { numRows: 100 },
      columns: [{ name: 'col1', type: 'int' }],
      rowCount: 100,
    };
    mockApiService.executeQueryArrowRaw.mockResolvedValue(arrowResult);
    
    // Simulate successful cache
    mockColumnCacheManager.getCacheTableName.mockReturnValue('cached_table');
    
    // Simulate aggregation result
    mockDuckDBService.query.mockResolvedValue({
      columns: ['agg_col'],
      rows: [{ agg_col: 50 }],
    });

    const inputWithAgg = { ...mockInput, requiresAggregation: true };
    const result = await orchestrator.execute(inputWithAgg);

    expect(result.result.local_query).toBe(true);
    expect(mockColumnCacheManager.cacheColumns).toHaveBeenCalled();
    expect(mockDuckDBService.query).toHaveBeenCalled(); // Local aggregation
  });

  test('window calc override executes the view query, not the raw slice', async () => {
    // Decision preview said raw_columns (small table), so the caller passed a
    // raw slice as fetchQueryDesc. The window-calc override must flip to
    // pre_aggregated AND execute the aggregated view query — otherwise the
    // chart receives unaggregated raw rows.
    const decision: QueryDecision = {
      strategy: 'raw_columns',
      requiresBackendQuery: true,
      baseFilterHash: 'hash123',
      reason: 'test',
    };
    mockQueryDecisionEngine.decide.mockResolvedValue(decision);

    const viewQueryDesc = {
      target_table: 'test_table',
      dimensions: [{ field: 'ts', flavour: 'continuous', date_part: 'day', date_mode: 'timeline' }],
      measures: [
        {
          field: 'weight',
          aggregation: 'max',
          alias: 'DIFF(MAX(weight))',
          window_calc: { function: 'difference', order_by_field: 'ts_day_timeline', partition_by: [] },
        },
      ],
    } as any;
    const rawSlice = { target_table: 'test_table', force_raw_rows: true } as any;

    mockApiService.executeQueryArrowRaw.mockResolvedValue({
      arrowTable: { numRows: 0, schema: { fields: [] }, getChild: jest.fn() },
      columns: [{ name: 'DIFF(MAX(weight))', type: 'double' }],
      rowCount: 0,
      rows: [],
    });

    const result = await orchestrator.execute({
      ...mockInput,
      viewQueryDesc,
      fetchQueryDesc: rawSlice,
      requiresAggregation: true,
    });

    expect(result.decision?.strategy).toBe('pre_aggregated');
    expect(mockApiService.executeQueryArrowRaw).toHaveBeenCalledWith(viewQueryDesc, undefined);
    expect(mockApiService.executeQueryArrowRaw).not.toHaveBeenCalledWith(rawSlice, undefined);
  });

  test('arg_max aggregation override executes the view query, not the raw slice', async () => {
    const decision: QueryDecision = {
      strategy: 'raw_columns',
      requiresBackendQuery: true,
      baseFilterHash: 'hash123',
      reason: 'test',
    };
    mockQueryDecisionEngine.decide.mockResolvedValue(decision);

    const viewQueryDesc = {
      target_table: 'test_table',
      dimensions: [{ field: 'ts', flavour: 'continuous', date_part: 'day', date_mode: 'timeline' }],
      measures: [
        { field: 'weight', aggregation: 'arg_max', aggregation_arg: 'ts', alias: 'LATEST(weight)' },
      ],
    } as any;
    const rawSlice = { target_table: 'test_table', force_raw_rows: true } as any;

    mockApiService.executeQueryArrowRaw.mockResolvedValue({
      arrowTable: { numRows: 0, schema: { fields: [] }, getChild: jest.fn() },
      columns: [{ name: 'LATEST(weight)', type: 'double' }],
      rowCount: 0,
      rows: [],
    });

    const result = await orchestrator.execute({
      ...mockInput,
      viewQueryDesc,
      fetchQueryDesc: rawSlice,
      requiresAggregation: true,
    });

    expect(result.decision?.strategy).toBe('pre_aggregated');
    expect(mockApiService.executeQueryArrowRaw).toHaveBeenCalledWith(viewQueryDesc, undefined);
  });
});
