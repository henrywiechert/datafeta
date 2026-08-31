// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, MeasureGroup } from '../../../types';
import { getMeasureMemberIdentity } from '../../../utils/syntheticFields';
import { VisualizationState, VisualizationAction } from '../types';

function sameMembers(a: Field[], b: Field[]): boolean {
  return a.length === b.length && a.every((f, i) => f === b[i]);
}

/** Reject members that would collide in the wide query (same result-column identity). */
function dedupeByIdentity(members: Field[]): Field[] {
  const seen = new Set<string>();
  const result: Field[] = [];
  for (const member of members) {
    const identity = getMeasureMemberIdentity(member);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(member);
  }
  return result;
}

function withMembers(state: VisualizationState, members: Field[], bumpVersion = true): VisualizationState {
  const measureGroup: MeasureGroup = { ...state.measureGroup, members };
  return {
    ...state,
    measureGroup,
    queryVersion: bumpVersion ? state.queryVersion + 1 : state.queryVersion,
  };
}

/**
 * Handles measure group actions.
 * The measure group is per-sheet (Tableau-like single group per sheet).
 */
export function measureGroupReducer(state: VisualizationState, action: VisualizationAction): VisualizationState | null {
  switch (action.type) {
    case 'SET_MEASURE_GROUP_MEMBERS': {
      const nextMembers = dedupeByIdentity(action.payload);
      if (sameMembers(state.measureGroup.members, nextMembers)) return state;
      return withMembers(state, nextMembers);
    }
    case 'ADD_MEASURE_GROUP_MEMBER': {
      const member = action.payload;
      const identity = getMeasureMemberIdentity(member);
      // Same column is allowed with a different aggregation; exact duplicates collide
      if (state.measureGroup.members.some(m => getMeasureMemberIdentity(m) === identity)) {
        return state;
      }
      return withMembers(state, [...state.measureGroup.members, member]);
    }
    case 'UPDATE_MEASURE_GROUP_MEMBER': {
      const updated = action.payload;
      const members = state.measureGroup.members;
      const index = members.findIndex(m => m.id === updated.id);
      if (index === -1) return state;
      const identity = getMeasureMemberIdentity(updated);
      // Reject an update that would collide with another member
      if (members.some(m => m.id !== updated.id && getMeasureMemberIdentity(m) === identity)) {
        return state;
      }
      if (members[index] === updated) return state;
      const nextMembers = [...members];
      nextMembers[index] = updated;
      return withMembers(state, nextMembers);
    }
    case 'REMOVE_MEASURE_GROUP_MEMBERS': {
      const idSet = new Set(action.payload);
      const nextMembers = state.measureGroup.members.filter(m => !idSet.has(m.id));
      if (nextMembers.length === state.measureGroup.members.length) {
        return state;
      }
      return withMembers(state, nextMembers);
    }
    case 'POPULATE_MEASURE_GROUP': {
      // Only fills an empty group; no queryVersion bump (dispatched mid query execution)
      if (state.measureGroup.members.length > 0) return state;
      const nextMembers = dedupeByIdentity(action.payload);
      if (nextMembers.length === 0) return state;
      return withMembers(state, nextMembers, false);
    }
    case 'PRUNE_MEASURE_GROUP_MEMBERS': {
      const validNames = new Set(action.payload.validMeasureNames);
      const nextMembers = state.measureGroup.members.filter(m => validNames.has(m.columnName));
      if (nextMembers.length === state.measureGroup.members.length) {
        return state;
      }
      return withMembers(state, nextMembers);
    }
    case 'RENAME_MEASURE_GROUP': {
      const name = action.payload.trim();
      if (!name || name === state.measureGroup.name) return state;
      return {
        ...state,
        measureGroup: { ...state.measureGroup, name },
      };
    }
    case 'CLEAR_MEASURE_GROUP': {
      if (state.measureGroup.members.length === 0) {
        return state;
      }
      return withMembers(state, []);
    }
    default:
      return null; // Not handled by this reducer
  }
}
