// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tablet tap-to-assign must land fields exactly where a desktop drop would,
 * including the drop zones' field resolution (fresh copies, discrete-only
 * shelves, measure-only group).
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useAssignToShelf } from './useAssignToShelf';
import { useDragDrop } from './useDragDrop';
import { DataSourceProvider } from '../contexts/DataSourceContext';
import { VisualizationProvider, useVisualizationContext } from '../contexts/VisualizationContext';
import { UndoRedoProvider } from '../contexts/UndoRedoContext';
import { Field } from '../types';

const region: Field = {
  id: 'available-region',
  columnName: 'region',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const sales: Field = {
  id: 'available-sales',
  columnName: 'sales',
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
};

const availableFields = [region, sales];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DataSourceProvider>
    <VisualizationProvider>
      <UndoRedoProvider sheetId="sheet-1">{children}</UndoRedoProvider>
    </VisualizationProvider>
  </DataSourceProvider>
);

const renderAssign = () =>
  renderHook(
    () => ({
      assign: useAssignToShelf(useDragDrop(availableFields)),
      state: useVisualizationContext().state,
    }),
    { wrapper },
  );

describe('useAssignToShelf', () => {
  it('assigns to an axis through the desktop axis drop handler', () => {
    const { result } = renderAssign();

    act(() => {
      result.current.assign('x', region, 'AVAILABLE_FIELDS');
    });

    expect(result.current.state.xAxisFields.map(f => f.columnName)).toEqual(['region']);
  });

  it('sets color to an independent copy of the available field', () => {
    const { result } = renderAssign();

    act(() => {
      result.current.assign('color', region, 'AVAILABLE_FIELDS');
    });

    expect(result.current.state.colorField?.columnName).toBe('region');
    expect(result.current.state.colorField?.id).not.toBe(region.id);
  });

  it('rejects continuous fields on discrete-only shelves', () => {
    const { result } = renderAssign();

    act(() => {
      result.current.assign('shape', sales, 'AVAILABLE_FIELDS');
      result.current.assign('background', sales, 'AVAILABLE_FIELDS');
    });

    expect(result.current.state.shapeField).toBeNull();
    expect(result.current.state.facetBackgroundField).toBeNull();
  });

  it('adds a tooltip column only once', () => {
    const { result } = renderAssign();

    act(() => {
      result.current.assign('tooltip', region, 'AVAILABLE_FIELDS');
    });
    act(() => {
      result.current.assign('tooltip', region, 'AVAILABLE_FIELDS');
    });

    expect(result.current.state.tooltipFields.map(f => f.columnName)).toEqual(['region']);
  });

  it('adds measures but not dimensions to the measure group', () => {
    const { result } = renderAssign();

    act(() => {
      result.current.assign('measureGroup', region, 'AVAILABLE_FIELDS');
      result.current.assign('measureGroup', sales, 'AVAILABLE_FIELDS');
    });

    expect(result.current.state.measureGroup.members.map(f => f.columnName)).toEqual(['sales']);
  });
});
