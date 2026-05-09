import { apiService } from '../apiService';
import { columnCacheManager } from './columnCacheManager';
import { filterTierManager } from './filterTierManager';
import { QueryDecisionEngine } from './queryDecisionEngine';

jest.mock('../apiService', () => ({
  apiService: {
    getRowCount: jest.fn(),
  },
}));

jest.mock('./columnCacheManager', () => ({
  columnCacheManager: {
    invalidateForTable: jest.fn(),
    getCachedColumns: jest.fn(),
  },
}));

jest.mock('./filterTierManager', () => ({
  filterTierManager: {
    getBaseFilterHash: jest.fn(),
    getRefinementFilters: jest.fn(),
    hasBaseFilterChanged: jest.fn(),
    updateBaseFilters: jest.fn(),
    getBaseFiltersOnly: jest.fn(),
    hashFilters: jest.fn(),
  },
}));

describe('QueryDecisionEngine', () => {
  let engine: QueryDecisionEngine;
  let mockApiService: jest.Mocked<typeof apiService>;
  let mockColumnCacheManager: jest.Mocked<typeof columnCacheManager>;
  let mockFilterTierManager: jest.Mocked<typeof filterTierManager>;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new QueryDecisionEngine();

    mockApiService = apiService as jest.Mocked<typeof apiService>;
    mockColumnCacheManager = columnCacheManager as jest.Mocked<typeof columnCacheManager>;
    mockFilterTierManager = filterTierManager as jest.Mocked<typeof filterTierManager>;

    mockFilterTierManager.getBaseFilterHash.mockReturnValue('base-hash');
    mockFilterTierManager.getRefinementFilters.mockReturnValue({ refinement: true });
    mockFilterTierManager.hasBaseFilterChanged.mockReturnValue(false);
    mockFilterTierManager.getBaseFiltersOnly.mockReturnValue({ base: true });
    mockFilterTierManager.hashFilters.mockReturnValue('filter-hash');
    mockColumnCacheManager.getCachedColumns.mockReturnValue([]);

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('returns cache_hit when all required columns are already cached', async () => {
    mockColumnCacheManager.getCachedColumns.mockReturnValue(['city', 'sales']);

    const decision = await engine.decide({
      sourceTable: 'orders',
      sourceDatabase: 'analytics',
      requiredColumns: ['city', 'sales'],
      filterConfigurations: {},
      requiresAggregation: false,
    });

    expect(decision).toEqual({
      strategy: 'cache_hit',
      cachedColumns: ['city', 'sales'],
      requiresBackendQuery: false,
      baseFilterHash: 'base-hash',
      refinementFilters: { refinement: true },
      reason: 'All 2 columns available in cache',
    });
    expect(mockApiService.getRowCount).not.toHaveBeenCalled();
    expect(mockColumnCacheManager.invalidateForTable).not.toHaveBeenCalled();
  });

  test('invalidates cache and fetches all required columns when base filter changed', async () => {
    mockFilterTierManager.hasBaseFilterChanged.mockReturnValue(true);
    mockFilterTierManager.getBaseFilterHash
      .mockReturnValueOnce('old-hash')
      .mockReturnValueOnce('new-hash');
    mockApiService.getRowCount.mockResolvedValue(250);

    const decision = await engine.decide({
      sourceTable: 'orders',
      sourceDatabase: 'analytics',
      requiredColumns: ['city', 'sales'],
      filterConfigurations: { city: { value: 'Paris' } },
      requiresAggregation: false,
      sizeThreshold: 1000,
    });

    expect(mockColumnCacheManager.invalidateForTable).toHaveBeenCalledWith('orders', 'analytics');
    expect(mockFilterTierManager.updateBaseFilters).toHaveBeenCalledWith(
      { city: { value: 'Paris' } },
      'orders',
      'analytics'
    );
    expect(decision.strategy).toBe('raw_columns');
    expect(decision.columnsToFetch).toEqual(['city', 'sales']);
    expect(decision.cachedColumns).toBeUndefined();
    expect(decision.baseFilterHash).toBe('new-hash');
    expect(decision.reason).toContain('Base filter changed');
  });

  test('returns pre_aggregated and only missing columns for large datasets', async () => {
    mockColumnCacheManager.getCachedColumns.mockReturnValue(['city']);
    mockApiService.getRowCount.mockResolvedValue(9000);

    const decision = await engine.decide({
      sourceTable: 'orders',
      sourceDatabase: 'analytics',
      requiredColumns: ['city', 'sales'],
      filterConfigurations: {},
      requiresAggregation: true,
      sizeThreshold: 1000,
    });

    expect(decision.strategy).toBe('pre_aggregated');
    expect(decision.columnsToFetch).toEqual(['sales']);
    expect(decision.cachedColumns).toEqual(['city']);
    expect(decision.estimatedRowCount).toBe(9000);
    expect(decision.requiresBackendQuery).toBe(true);
  });

  test('reuses cached row count for repeated decisions with the same base filters', async () => {
    mockApiService.getRowCount.mockResolvedValue(400);

    const input = {
      sourceTable: 'orders',
      sourceDatabase: 'analytics',
      requiredColumns: ['sales'],
      filterConfigurations: {},
      requiresAggregation: false,
      sizeThreshold: 1000,
    };

    await engine.decide(input);
    await engine.decide(input);

    expect(mockApiService.getRowCount).toHaveBeenCalledTimes(1);
    expect(engine.getStats()).toEqual({
      sizeThreshold: 5000000,
      rowCountCacheSize: 1,
    });
  });

  test('falls back to raw_columns when row count probe fails', async () => {
    engine.setSizeThreshold(1000);
    mockApiService.getRowCount.mockRejectedValue(new Error('boom'));

    const decision = await engine.decide({
      sourceTable: 'orders',
      sourceDatabase: 'analytics',
      requiredColumns: ['sales'],
      filterConfigurations: {},
      requiresAggregation: false,
    });

    expect(decision.strategy).toBe('raw_columns');
    expect(decision.estimatedRowCount).toBe(999);
    expect(warnSpy).toHaveBeenCalled();
  });
});