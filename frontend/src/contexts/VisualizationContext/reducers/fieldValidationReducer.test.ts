// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { fieldValidationReducer } from './fieldValidationReducer';
import { initialState } from '../initialState';
import { VisualizationState } from '../types';
import { Field } from '../../../types';

const dimension = (columnName: string): Field => ({
  id: `dim-${columnName}`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

const measure = (columnName: string): Field => ({
  id: `msr-${columnName}`,
  columnName,
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
  aggregation: 'sum',
});

const validate = (
  state: VisualizationState,
  validNames: string[],
  validMeasureNames: string[] = validNames,
) =>
  fieldValidationReducer(state, {
    type: 'VALIDATE_ALL_FIELDS',
    payload: { validNames, validMeasureNames },
  } as any)!;

describe('fieldValidationReducer', () => {
  it('ignores actions it does not handle', () => {
    expect(fieldValidationReducer(initialState, { type: 'SWAP_AXIS_FIELDS' } as any)).toBeNull();
  });

  // The point of the feature: an invalid field reads the same wherever it sits.
  it('flags every field-bearing slot, not just the axes', () => {
    const state: VisualizationState = {
      ...initialState,
      xAxisFields: [dimension('region')],
      yAxisFields: [measure('amount')],
      filterFields: [dimension('gone_filter')],
      labelFields: [dimension('gone_label')],
      tooltipFields: [dimension('gone_tooltip')],
      tableColumnFields: [dimension('gone_column')],
      colorField: dimension('gone_colour'),
      sizeField: measure('gone_size'),
      shapeField: dimension('gone_shape'),
      facetBackgroundField: dimension('gone_background'),
    };

    const next = validate(state, ['region', 'amount']);

    expect(next.xAxisFields[0].isInvalid).toBe(false);
    expect(next.yAxisFields[0].isInvalid).toBe(false);
    expect(next.filterFields[0].isInvalid).toBe(true);
    expect(next.labelFields[0].isInvalid).toBe(true);
    expect(next.tooltipFields[0].isInvalid).toBe(true);
    expect(next.tableColumnFields[0].isInvalid).toBe(true);
    expect(next.colorField?.isInvalid).toBe(true);
    expect(next.sizeField?.isInvalid).toBe(true);
    expect(next.shapeField?.isInvalid).toBe(true);
    expect(next.facetBackgroundField?.isInvalid).toBe(true);
  });

  it('leaves empty single-field slots as null', () => {
    const next = validate({ ...initialState, colorField: null }, ['region']);

    expect(next.colorField).toBeNull();
  });

  // Replaces PRUNE_MEASURE_GROUP_MEMBERS: members are kept and flagged now.
  it('marks measure group members instead of dropping them', () => {
    const state: VisualizationState = {
      ...initialState,
      measureGroup: {
        ...initialState.measureGroup,
        members: [measure('amount'), measure('gone')],
      },
    };

    const next = validate(state, ['amount'], ['amount']);

    expect(next.measureGroup.members).toHaveLength(2);
    expect(next.measureGroup.members.map((m) => m.isInvalid)).toEqual([false, true]);
  });

  // A column that still exists but is no longer a measure does not qualify.
  it('judges measure group members against the measure names only', () => {
    const state: VisualizationState = {
      ...initialState,
      xAxisFields: [dimension('amount')],
      measureGroup: { ...initialState.measureGroup, members: [measure('amount')] },
    };

    const next = validate(state, ['amount'], []);

    expect(next.xAxisFields[0].isInvalid).toBe(false);
    expect(next.measureGroup.members[0].isInvalid).toBe(true);
  });

  it('flags everything when there is no schema left to check against', () => {
    const state: VisualizationState = {
      ...initialState,
      xAxisFields: [dimension('region')],
      filterFields: [dimension('region')],
      colorField: dimension('region'),
    };

    const next = validate(state, [], []);

    expect(next.xAxisFields[0].isInvalid).toBe(true);
    expect(next.filterFields[0].isInvalid).toBe(true);
    expect(next.colorField?.isInvalid).toBe(true);
  });

  // This runs after every schema fetch; a fresh object would re-render the sheet.
  it('returns the identical state when no flag changes', () => {
    const state: VisualizationState = {
      ...initialState,
      xAxisFields: [{ ...dimension('region'), isInvalid: false }],
      filterFields: [{ ...dimension('gone'), isInvalid: true }],
      colorField: { ...dimension('region'), isInvalid: false },
    };

    expect(validate(state, ['region'])).toBe(state);
  });

  // Flagging changes how a field is drawn, not what is queried.
  it('does not bump queryVersion', () => {
    const state: VisualizationState = {
      ...initialState,
      xAxisFields: [dimension('region')],
      queryVersion: 7,
    };

    expect(validate(state, []).queryVersion).toBe(7);
  });
});
