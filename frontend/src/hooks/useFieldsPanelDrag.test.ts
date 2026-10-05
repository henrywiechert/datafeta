// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useFieldsPanelDrag } from './useFieldsPanelDrag';
import { clearDragData, setDragData } from '../utils/dragDataStore';
import { Field } from '../types';

const field = (id: string): Field => ({
  id,
  columnName: id,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

const dropEvent = () => ({ preventDefault: jest.fn(), dataTransfer: undefined }) as any;

describe('useFieldsPanelDrag', () => {
  afterEach(() => clearDragData());

  it('removes every dragged field from its source zone in one call', () => {
    const onRemoveFromZone = jest.fn();
    const { result } = renderHook(() => useFieldsPanelDrag(onRemoveFromZone));

    setDragData({ fields: [field('a'), field('b')], source: 'LINE_STYLE_ZONE', indices: [0, 1] });
    act(() => result.current.handleDrop(dropEvent()));

    expect(onRemoveFromZone).toHaveBeenCalledTimes(1);
    expect(onRemoveFromZone).toHaveBeenCalledWith('LINE_STYLE_ZONE', ['a', 'b']);
  });

  it('ignores drags that start in the field list', () => {
    const onRemoveFromZone = jest.fn();
    const { result } = renderHook(() => useFieldsPanelDrag(onRemoveFromZone));

    setDragData({ fields: [field('a')], source: 'AVAILABLE_FIELDS', indices: [0] });
    act(() => result.current.handleDrop(dropEvent()));

    expect(onRemoveFromZone).not.toHaveBeenCalled();
  });
});
