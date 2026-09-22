// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { dataSourceReducer } from './reducer';
import { DataSourceState, initialDataSourceState } from './types';

type UnionTableRef = { database: string; table_name: string };

function stateWithUnions(unionTables: UnionTableRef[]): DataSourceState {
  return {
    ...initialDataSourceState,
    selectedDatabase: 'prod_us',
    selectedTable: 'orders',
    unionTables,
  };
}

describe('dataSourceReducer — batched union tables', () => {
  describe('ADD_UNION_TABLES', () => {
    it('appends every new ref in payload order', () => {
      const state = stateWithUnions([{ database: 'prod_us', table_name: 'events' }]);

      const next = dataSourceReducer(state, {
        type: 'ADD_UNION_TABLES',
        payload: {
          tables: [
            { database: 'prod_eu', table_name: 'orders' },
            { database: 'prod_eu', table_name: 'events' },
          ],
        },
      });

      expect(next.unionTables).toEqual([
        { database: 'prod_us', table_name: 'events' },
        { database: 'prod_eu', table_name: 'orders' },
        { database: 'prod_eu', table_name: 'events' },
      ]);
    });

    it('drops refs already selected and duplicates within the payload', () => {
      const state = stateWithUnions([{ database: 'prod_eu', table_name: 'orders' }]);

      const next = dataSourceReducer(state, {
        type: 'ADD_UNION_TABLES',
        payload: {
          tables: [
            { database: 'prod_eu', table_name: 'orders' },
            { database: 'prod_eu', table_name: 'events' },
            { database: 'prod_eu', table_name: 'events' },
          ],
        },
      });

      expect(next.unionTables).toEqual([
        { database: 'prod_eu', table_name: 'orders' },
        { database: 'prod_eu', table_name: 'events' },
      ]);
    });

    it('treats an empty database as a distinct namespace', () => {
      const state = stateWithUnions([{ database: '', table_name: 'orders' }]);

      const next = dataSourceReducer(state, {
        type: 'ADD_UNION_TABLES',
        payload: { tables: [{ database: 'prod_eu', table_name: 'orders' }] },
      });

      expect(next.unionTables).toHaveLength(2);
    });

    // The merged-columns effect keys on `unionTables` identity, so a no-op that
    // returned a fresh state object would cost a getMergedColumns round trip.
    it('returns the identical state object when nothing is added', () => {
      const state = stateWithUnions([{ database: 'prod_eu', table_name: 'orders' }]);

      expect(
        dataSourceReducer(state, {
          type: 'ADD_UNION_TABLES',
          payload: { tables: [{ database: 'prod_eu', table_name: 'orders' }] },
        }),
      ).toBe(state);

      expect(
        dataSourceReducer(state, { type: 'ADD_UNION_TABLES', payload: { tables: [] } }),
      ).toBe(state);
    });
  });

  describe('REMOVE_UNION_TABLES', () => {
    it('removes exactly the given refs and leaves the rest untouched', () => {
      const state = stateWithUnions([
        { database: 'prod_us', table_name: 'events' },
        { database: 'prod_eu', table_name: 'orders' },
        { database: 'prod_eu', table_name: 'events' },
      ]);

      const next = dataSourceReducer(state, {
        type: 'REMOVE_UNION_TABLES',
        payload: {
          tables: [
            { database: 'prod_eu', table_name: 'orders' },
            { database: 'prod_eu', table_name: 'events' },
          ],
        },
      });

      expect(next.unionTables).toEqual([{ database: 'prod_us', table_name: 'events' }]);
    });

    it('ignores refs that are not selected', () => {
      const state = stateWithUnions([{ database: 'prod_us', table_name: 'events' }]);

      const next = dataSourceReducer(state, {
        type: 'REMOVE_UNION_TABLES',
        payload: { tables: [{ database: 'prod_us', table_name: 'events' }] },
      });

      expect(next.unionTables).toEqual([]);
    });

    it('returns the identical state object when nothing matches', () => {
      const state = stateWithUnions([{ database: 'prod_us', table_name: 'events' }]);

      expect(
        dataSourceReducer(state, {
          type: 'REMOVE_UNION_TABLES',
          payload: { tables: [{ database: 'prod_eu', table_name: 'events' }] },
        }),
      ).toBe(state);

      expect(
        dataSourceReducer(state, { type: 'REMOVE_UNION_TABLES', payload: { tables: [] } }),
      ).toBe(state);
    });
  });
});
