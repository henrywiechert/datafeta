// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import FieldCategory from './FieldCategory';
import { Field } from '../../../types';
import { useSelectionStore } from '../../../stores/selectionStore';

jest.mock('../../../hooks/useFieldDisplayName', () => ({
  useFieldDisplayName: () => (field: { columnName: string }) => field.columnName,
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (global as any).ResizeObserver = ResizeObserverMock;
});

beforeEach(() => {
  act(() => useSelectionStore.getState().clearSelection());
});

const measure = (id: string): Field => ({
  id,
  columnName: id,
  type: 'measure',
  flavour: 'continuous',
  dataType: 'float',
});

const chip = (name: string) => screen.getByText(name).closest('.MuiChip-root') as HTMLElement;

const selectedIds = () => useSelectionStore.getState().selectedFields.map((sf) => sf.fieldId);

describe('FieldCategory range selection', () => {
  it('shift-click selects only the visible fields after the list was narrowed', () => {
    const all = ['a', 'x1', 'b', 'x2', 'c', 'x3', 'd'].map(measure);
    const { rerender } = render(<FieldCategory title="Measures" fields={all} onUpdate={jest.fn()} />);

    // The panel search hands the category a filtered list; matching chips stay mounted.
    const visible = all.filter((f) => !f.id.startsWith('x'));
    rerender(<FieldCategory title="Measures" fields={visible} onUpdate={jest.fn()} />);

    fireEvent.mouseDown(chip('a'));
    fireEvent.mouseDown(chip('d'), { shiftKey: true });

    expect(selectedIds()).toEqual(['a', 'b', 'c', 'd']);
  });
});
