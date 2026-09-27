// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Field, DragSource } from '../types';
import type { FieldAssignApi, FieldAssignShelf } from '../contexts/FieldAssignContext';
import { resolveSingleEncodingDropField } from '../utils/singleEncodingZone';
import { useShelfActions } from './useShelfActions';
import type { useDragDrop } from './useDragDrop';

type DropHandlers = Pick<
  ReturnType<typeof useDragDrop>,
  'handleAxisDrop' | 'handleFilterDrop' | 'handleTableColumnsDrop'
>;

/**
 * Tablet tap-to-assign: maps a shelf choice to the same handlers a desktop drop
 * reaches. Encoding shelves apply the Properties drop-zone field resolution,
 * then commit via useShelfActions.
 */
export function useAssignToShelf({
  handleAxisDrop,
  handleFilterDrop,
  handleTableColumnsDrop,
}: DropHandlers): FieldAssignApi['assignToShelf'] {
  const shelfActions = useShelfActions();

  return useCallback((
    shelf: FieldAssignShelf,
    field: Field,
    source: DragSource,
  ) => {
    const resolveSingle = (
      zoneSource: DragSource,
      requiredFlavour?: Field['flavour'],
    ) => resolveSingleEncodingDropField({ field, source, zoneSource, requiredFlavour });
    const copy = (): Field => ({ ...field, id: uuidv4() });

    switch (shelf) {
      case 'x':
        handleAxisDrop('x', field, source);
        break;
      case 'y':
        handleAxisDrop('y', field, source);
        break;
      case 'filter':
        handleFilterDrop(field, source);
        break;
      case 'table':
        handleTableColumnsDrop(field, source);
        break;
      case 'color': {
        const resolved = resolveSingle('COLOR_ZONE');
        if (resolved) shelfActions.setColorField(resolved);
        break;
      }
      case 'size': {
        const resolved = resolveSingle('SIZE_ZONE');
        if (resolved) shelfActions.setSizeField(resolved);
        break;
      }
      case 'shape': {
        const resolved = resolveSingle('SHAPE_ZONE', 'discrete');
        if (resolved) shelfActions.setShapeField(resolved);
        break;
      }
      case 'background': {
        const resolved = resolveSingle('BACKGROUND_ZONE', 'discrete');
        if (resolved) shelfActions.setBackgroundField(resolved);
        break;
      }
      case 'label':
        shelfActions.addLabelField(copy());
        break;
      case 'tooltip':
        shelfActions.addTooltipField(copy());
        break;
      case 'measureGroup':
        shelfActions.addMeasureGroupMember(field);
        break;
      default:
        break;
    }
  }, [handleAxisDrop, handleFilterDrop, handleTableColumnsDrop, shelfActions]);
}
