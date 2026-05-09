import { tableToIPC } from 'apache-arrow';
import { arrowTableToRows } from './arrowResultAdapter';
import { DuckDBService } from './duckdbService';

jest.mock('@duckdb/duckdb-wasm', () => ({
  AsyncDuckDB: jest.fn(),
  ConsoleLogger: jest.fn(),
  LogLevel: { WARNING: 0 },
}));

jest.mock('apache-arrow', () => ({
  tableToIPC: jest.fn(),
}));

jest.mock('./arrowResultAdapter', () => ({
  arrowTableToRows: jest.fn(),
}));

describe('DuckDBService', () => {
  let service: DuckDBService;
  let conn: { query: jest.Mock; close: jest.Mock; insertArrowFromIPCStream: jest.Mock };
  let db: { terminate: jest.Mock };
  let worker: { terminate: jest.Mock };
  let nowSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DuckDBService();
    conn = {
      query: jest.fn(),
      close: jest.fn(),
      insertArrowFromIPCStream: jest.fn(),
    };
    db = { terminate: jest.fn() };
    worker = { terminate: jest.fn() };

    (service as any).conn = conn;
    (service as any).db = db;
    (service as any).worker = worker;
    (service as any)._status = 'ready';

    nowSpy = jest.spyOn(performance, 'now').mockReturnValue(100);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('query converts Arrow results and records query log metadata', async () => {
    const arrowTable = {
      numRows: 2,
      schema: { fields: [{ name: 'city' }, { name: 'sales' }] },
    } as any;

    conn.query.mockResolvedValue(arrowTable);
    (arrowTableToRows as jest.MockedFunction<typeof arrowTableToRows>).mockReturnValue([
      { city: 'Paris', sales: 10 },
      { city: 'Berlin', sales: 20 },
    ]);
    nowSpy.mockReturnValueOnce(100).mockReturnValueOnce(135);

    const result = await service.query('SELECT city, sales FROM cached_orders');

    expect(result).toEqual({
      columns: ['city', 'sales'],
      rows: [
        { city: 'Paris', sales: 10 },
        { city: 'Berlin', sales: 20 },
      ],
      rowCount: 2,
    });
    expect(conn.query).toHaveBeenCalledWith('SELECT city, sales FROM cached_orders');
    expect(service.queryLog).toHaveLength(1);
    expect(service.queryLog[0]).toMatchObject({
      sql: 'SELECT city, sales FROM cached_orders',
      durationMs: 35,
      rowCount: 2,
    });
  });

  test('registerArrowTable uses native IPC insertion and widens unsigned columns', async () => {
    const arrowTable = {
      numRows: 3,
      schema: { fields: [{ name: 'city' }] },
    } as any;

    (tableToIPC as jest.MockedFunction<typeof tableToIPC>).mockReturnValue(new Uint8Array([1, 2, 3]));
    jest.spyOn(service, 'getTableSchema').mockResolvedValue([
      { column: 'count_u32', type: 'UINTEGER' },
      { column: 'city', type: 'VARCHAR' },
    ]);

    await service.registerArrowTable('cached_orders', arrowTable);

    expect(tableToIPC).toHaveBeenCalledWith(arrowTable);
    expect(conn.insertArrowFromIPCStream).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), {
      name: 'cached_orders',
      create: true,
    });
    expect(conn.query).toHaveBeenCalledWith('ALTER TABLE "cached_orders" ALTER COLUMN "count_u32" TYPE BIGINT');
    expect(service.hasTable('cached_orders')).toBe(true);
  });

  test('registerJsonData creates typed schema, escapes values, and inserts in batches', async () => {
    jest.spyOn(service, 'getTableSchema').mockResolvedValue([]);

    const rows = [
      { city: "O'Hare", sales: 10, active: true, created_at: new Date('2024-01-02T03:04:05.000Z') },
      { city: 'Paris', sales: 11, active: false, created_at: new Date('2024-01-03T03:04:05.000Z') },
    ];

    await service.registerJsonData('json_orders', rows);

    expect(conn.query).toHaveBeenNthCalledWith(
      1,
      'CREATE TABLE "json_orders" ("city" VARCHAR, "sales" BIGINT, "active" BOOLEAN, "created_at" TIMESTAMP)'
    );
    expect(conn.query).toHaveBeenNthCalledWith(
      2,
      `INSERT INTO "json_orders" VALUES ('O''Hare', 10, TRUE, '2024-01-02T03:04:05.000Z'), ('Paris', 11, FALSE, '2024-01-03T03:04:05.000Z')`
    );
    expect(service.hasTable('json_orders')).toBe(true);
  });

  test('close tears down resources and resets service state', async () => {
    (service as any).registeredTables.add('cached_orders');
    (service as any).initPromise = Promise.resolve();

    await service.close();

    expect(conn.close).toHaveBeenCalled();
    expect(db.terminate).toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalled();
    expect(service.status).toBe('uninitialized');
    expect(service.tableNames).toEqual([]);
  });
});