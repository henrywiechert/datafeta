// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useShelfActions is the single commit path for global encoding shelves, used
 * by both the Properties drop zones and the tablet tap-to-assign menu. These
 * tests pin the side effects both paths rely on.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useShelfActions } from './useShelfActions';
import { DataSourceProvider } from '../contexts/DataSourceContext';
import { VisualizationProvider, useVisualizationContext } from '../contexts/VisualizationContext';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { DEFAULT_CATEGORICAL_SCHEME, DEFAULT_SEQUENTIAL_SCHEME } from '../config/colorSchemes';
import { Field } from '../types';

const makeField = (columnName: string, overrides: Partial<Field> = {}): Field => ({
  id: `field-${columnName}`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DataSourceProvider>
    <VisualizationProvider>
      <UndoRedoProvider sheetId="sheet-1">{children}</UndoRedoProvider>
    </VisualizationProvider>
  </DataSourceProvider>
);

const renderShelfActions = () =>
  renderHook(
    () => {
      const { state, dispatch } = useVisualizationContext();
      return { actions: useShelfActions(), state, dispatch };
    },
    { wrapper },
  );

describe('useShelfActions', () => {
  it('clears per-field color overrides but keeps unrelated overrides', () => {
    const { result } = renderShelfActions();
    act(() => {
      result.current.dispatch({
        type: 'SET_FIELD_OVERRIDES',
        payload: { m1: { colorScheme: 'reds', sizeRange: [2, 8], chartType: 'bar' } },
      });
    });

    act(() => {
      result.current.actions.setColorField(makeField('region'));
    });

    expect(result.current.state.colorField?.columnName).toBe('region');
    expect(result.current.state.fieldOverrides.m1).toEqual({ sizeRange: [2, 8], chartType: 'bar' });
  });

  it('switches to a sequential scheme when a continuous field replaces a categorical scheme', () => {
    const { result } = renderShelfActions();
    expect(result.current.state.colorScheme).toBe(DEFAULT_CATEGORICAL_SCHEME);

    act(() => {
      result.current.actions.setColorField(makeField('sales', { type: 'measure', flavour: 'continuous', dataType: 'float' }));
    });

    expect(result.current.state.colorScheme).toBe(DEFAULT_SEQUENTIAL_SCHEME);
  });

  it('clears per-field size overrides when the global size field is set', () => {
    const { result } = renderShelfActions();
    act(() => {
      result.current.dispatch({
        type: 'SET_FIELD_OVERRIDES',
        payload: { m1: { sizeRange: [2, 8], manualSize: 5, colorScheme: 'reds' } },
      });
    });

    act(() => {
      result.current.actions.setSizeField(makeField('sales', { type: 'measure', flavour: 'continuous', dataType: 'float' }));
    });

    expect(result.current.state.sizeField?.columnName).toBe('sales');
    expect(result.current.state.fieldOverrides.m1).toEqual({ colorScheme: 'reds' });
  });

  it('does not add a second tooltip field for the same column', () => {
    const { result } = renderShelfActions();

    act(() => {
      result.current.actions.addTooltipField(makeField('region', { id: 'copy-1' }));
    });
    act(() => {
      result.current.actions.addTooltipField(makeField('region', { id: 'copy-2' }));
    });

    expect(result.current.state.tooltipFields.map(f => f.id)).toEqual(['copy-1']);
  });

  it('adds only measures to the measure group, as fresh instances', () => {
    const { result } = renderShelfActions();
    const measure = makeField('sales', { type: 'measure', flavour: 'continuous', dataType: 'float' });

    act(() => {
      result.current.actions.addMeasureGroupMember(makeField('region'));
      result.current.actions.addMeasureGroupMember(measure);
    });

    const members = result.current.state.measureGroup.members;
    expect(members.map(f => f.columnName)).toEqual(['sales']);
    expect(members[0].id).not.toBe(measure.id);
  });

  it('keeps callbacks stable across state changes', () => {
    const { result } = renderShelfActions();
    const before = result.current.actions;

    act(() => {
      result.current.actions.setShapeField(makeField('region'));
    });

    expect(result.current.actions).toBe(before);
  });
});
