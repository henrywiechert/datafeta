// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
// Re-export the useUndoRedo hook from the context
// This maintains backwards compatibility with existing imports
import { useUndoRedo as useUndoRedoContext } from '../contexts/UndoRedoContext';

export const useUndoRedo = useUndoRedoContext;

