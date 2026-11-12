// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { CONNECTION_TYPES } from '../types/connection';
import { connectorTraits } from './connectorTraits';

describe('connectorTraits', () => {
  it('only ClickHouse browses tables per database', () => {
    expect(CONNECTION_TYPES.filter((t) => connectorTraits(t).hasDatabases)).toEqual(['clickhouse']);
  });

  it('keeps the per-type behaviour the call sites had before', () => {
    expect(CONNECTION_TYPES.filter((t) => connectorTraits(t).listsTablesOnConnect))
      .toEqual(['csv', 'sqlite', 'kaggle', 'huggingface', 'influxdb']);
    expect(CONNECTION_TYPES.filter((t) => connectorTraits(t).supportsJoins))
      .toEqual(['sqlite', 'clickhouse', 'kaggle', 'influxdb']);
    expect(CONNECTION_TYPES.filter((t) => connectorTraits(t).supportsNameUnion))
      .toEqual(['csv', 'sqlite', 'influxdb']);
  });

  it('gives unknown or missing types no capabilities', () => {
    for (const type of [undefined, null, '', 'postgres']) {
      expect(connectorTraits(type)).toEqual({
        hasDatabases: false,
        listsTablesOnConnect: false,
        supportsJoins: false,
        supportsNameUnion: false,
      });
    }
  });
});
