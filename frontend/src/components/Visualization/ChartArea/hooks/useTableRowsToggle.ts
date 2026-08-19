// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useTableRowsToggle – toggles the table-rows view on/off.
 *
 * When entering the view with an empty column list, the list is seeded once
 * from the current encodings. Afterwards the list is user-owned and never
 * re-seeded.
 */

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { useRecordUndoPoint } from '../../../../hooks/useRecordUndoPoint';
import { collectEncodingFields } from '../../../../utils/tableColumns';

export function useTableRowsToggle(): (show: boolean) => void {
  const { state, dispatch } = useVisualizationContext();
  const recordUndoPoint = useRecordUndoPoint();
  const {
    tableColumnFields,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    labelFields,
    tooltipFields,
  } = state;

  return useCallback(
    (show: boolean) => {
      recordUndoPoint();
      // Option C: seed the table view's column list once from the current
      // encodings when entering the view with an empty list. Afterwards
      // the list is user-owned and never re-seeded.
      if (show && tableColumnFields.length === 0) {
        const seed = collectEncodingFields(
          xAxisFields,
          yAxisFields,
          colorField,
          sizeField,
          labelFields,
          tooltipFields,
        ).map((f) => ({ ...f, id: uuidv4() }));
        if (seed.length > 0) {
          dispatch({ type: 'SET_TABLE_COLUMN_FIELDS', payload: seed });
        }
      }
      dispatch({ type: 'SET_SHOW_TABLE_ROWS', payload: show });
    },
    [
      recordUndoPoint,
      tableColumnFields,
      xAxisFields,
      yAxisFields,
      colorField,
      sizeField,
      labelFields,
      tooltipFields,
      dispatch,
    ],
  );
}
