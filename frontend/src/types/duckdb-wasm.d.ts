// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Type declarations for @duckdb/duckdb-wasm
 * 
 * These augment the types from the package for better IDE support.
 * The package does include its own types, but this file provides
 * additional type safety for our specific usage patterns.
 */

declare module '@duckdb/duckdb-wasm' {
  import { Table as ArrowTable } from 'apache-arrow';

  export enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARNING = 2,
    INFO = 3,
    DEBUG = 4,
  }

  export class ConsoleLogger {
    constructor(level?: LogLevel);
  }

  export interface DuckDBBundle {
    mainModule: string;
    mainWorker?: string;
    pthreadWorker?: string;
  }

  export interface DuckDBBundles {
    mvp?: DuckDBBundle;
    eh?: DuckDBBundle;
  }

  export function selectBundle(bundles: DuckDBBundles): Promise<DuckDBBundle>;

  export class AsyncDuckDB {
    constructor(logger: ConsoleLogger, worker: Worker);
    instantiate(mainModule: string, pthreadWorker?: string): Promise<void>;
    connect(): Promise<AsyncDuckDBConnection>;
    registerFileBuffer(fileName: string, buffer: Uint8Array): Promise<void>;
    terminate(): Promise<void>;
  }

  export class AsyncDuckDBConnection {
    query(sql: string): Promise<ArrowTable>;
    close(): Promise<void>;
  }
}

