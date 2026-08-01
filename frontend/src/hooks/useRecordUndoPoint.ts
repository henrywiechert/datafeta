// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback } from 'react';
import { useVisualizationContext } from '../contexts/VisualizationContext';
import { useUndoRedo } from './useUndoRedo';

/**
 * Push the current visualisation state onto the undo stack. Call it *before*
 * dispatching a state change, so undo returns to the pre-change state.
 *
 * This replaces the `recordAction(getUndoableSnapshot())` pair that action hooks used
 * to receive as two props. Both halves are stable, so the returned callback is stable
 * too and can be listed in a dependency array without invalidating memoized callbacks
 * on every state change — a hook that threads the pair through props instead has no
 * way to guarantee that for its callers.
 */
export function useRecordUndoPoint(): () => void {
  const { getUndoableSnapshot } = useVisualizationContext();
  const { recordAction } = useUndoRedo();

  return useCallback(() => {
    recordAction(getUndoableSnapshot());
  }, [recordAction, getUndoableSnapshot]);
}
