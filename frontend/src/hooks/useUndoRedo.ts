// Re-export the useUndoRedo hook from the context
// This maintains backwards compatibility with existing imports
import { useUndoRedo as useUndoRedoContext } from '../contexts/UndoRedoContext';

export const useUndoRedo = useUndoRedoContext;

