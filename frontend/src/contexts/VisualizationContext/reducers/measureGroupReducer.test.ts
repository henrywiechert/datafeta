// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { measureGroupReducer } from './measureGroupReducer';
import { initialState } from '../initialState';
import { VisualizationState } from '../types';
import { Field } from '../../../types';

const member = (id: string, columnName: string, aggregation?: Field['aggregation']): Field => ({
  id,
  columnName,
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  aggregation,
});

function stateWithMembers(members: Field[]): VisualizationState {
  return {
    ...initialState,
    measureGroup: { ...initialState.measureGroup, members },
  };
}

describe('measureGroupReducer', () => {
  it('adds a member and bumps queryVersion', () => {
    const state = stateWithMembers([]);
    const next = measureGroupReducer(state, {
      type: 'ADD_MEASURE_GROUP_MEMBER',
      payload: member('a', 'sales', 'sum'),
    })!;
    expect(next.measureGroup.members).toHaveLength(1);
    expect(next.queryVersion).toBe(state.queryVersion + 1);
  });

  it('allows the same column with a different aggregation', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum')]);
    const next = measureGroupReducer(state, {
      type: 'ADD_MEASURE_GROUP_MEMBER',
      payload: member('b', 'sales', 'avg'),
    })!;
    expect(next.measureGroup.members.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('rejects an exact (column, aggregation) duplicate', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum')]);
    const next = measureGroupReducer(state, {
      type: 'ADD_MEASURE_GROUP_MEMBER',
      payload: member('b', 'sales', 'sum'),
    });
    expect(next).toBe(state);
  });

  it('treats missing aggregation as sum for duplicate detection', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum')]);
    const next = measureGroupReducer(state, {
      type: 'ADD_MEASURE_GROUP_MEMBER',
      payload: member('b', 'sales', undefined),
    });
    expect(next).toBe(state);
  });

  it('updates a member in place', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum'), member('b', 'profit', 'sum')]);
    const next = measureGroupReducer(state, {
      type: 'UPDATE_MEASURE_GROUP_MEMBER',
      payload: member('a', 'sales', 'avg'),
    })!;
    expect(next.measureGroup.members[0].aggregation).toBe('avg');
    expect(next.queryVersion).toBe(state.queryVersion + 1);
  });

  it('rejects an update that would collide with another member', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum'), member('b', 'sales', 'avg')]);
    const next = measureGroupReducer(state, {
      type: 'UPDATE_MEASURE_GROUP_MEMBER',
      payload: member('b', 'sales', 'sum'),
    });
    expect(next).toBe(state);
  });

  it('removes members by id', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum'), member('b', 'profit', 'sum')]);
    const next = measureGroupReducer(state, {
      type: 'REMOVE_MEASURE_GROUP_MEMBERS',
      payload: ['a'],
    })!;
    expect(next.measureGroup.members.map((m) => m.id)).toEqual(['b']);
  });

  it('populates only an empty group and does not bump queryVersion', () => {
    const empty = stateWithMembers([]);
    const populated = measureGroupReducer(empty, {
      type: 'POPULATE_MEASURE_GROUP',
      payload: [member('a', 'sales', 'sum')],
    })!;
    expect(populated.measureGroup.members).toHaveLength(1);
    expect(populated.queryVersion).toBe(empty.queryVersion);

    const noop = measureGroupReducer(populated, {
      type: 'POPULATE_MEASURE_GROUP',
      payload: [member('b', 'profit', 'sum')],
    });
    expect(noop).toBe(populated);
  });

  it('prunes members whose column left the schema', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum'), member('b', 'gone', 'sum')]);
    const next = measureGroupReducer(state, {
      type: 'PRUNE_MEASURE_GROUP_MEMBERS',
      payload: { validMeasureNames: ['sales'] },
    })!;
    expect(next.measureGroup.members.map((m) => m.columnName)).toEqual(['sales']);
    expect(next.queryVersion).toBe(state.queryVersion + 1);
  });

  it('renames the group without bumping queryVersion', () => {
    const state = stateWithMembers([]);
    const next = measureGroupReducer(state, {
      type: 'RENAME_MEASURE_GROUP',
      payload: '  Finance  ',
    })!;
    expect(next.measureGroup.name).toBe('Finance');
    expect(next.queryVersion).toBe(state.queryVersion);
  });

  it('ignores an empty rename', () => {
    const state = stateWithMembers([]);
    const next = measureGroupReducer(state, {
      type: 'RENAME_MEASURE_GROUP',
      payload: '   ',
    });
    expect(next).toBe(state);
  });

  it('clears the group', () => {
    const state = stateWithMembers([member('a', 'sales', 'sum')]);
    const next = measureGroupReducer(state, { type: 'CLEAR_MEASURE_GROUP' })!;
    expect(next.measureGroup.members).toHaveLength(0);
    expect(next.measureGroup.id).toBe(state.measureGroup.id);
  });
});
