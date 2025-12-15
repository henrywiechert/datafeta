import { useSelectionStore } from './selectionStore';
import { DragSource } from '../types';

/**
 * Hook that returns whether a specific field is selected.
 * Only re-renders when THIS field's selection status changes.
 * 
 * Uses Zustand's selector with shallow comparison - since the result
 * is a primitive boolean, it only triggers re-render when the value changes.
 */
export function useIsFieldSelected(fieldId: string, source: DragSource): boolean {
  return useSelectionStore(
    (state) => state.selectedFields.some(sf => sf.fieldId === fieldId && sf.source === source)
  );
}

/**
 * Hook that returns selection count. Only re-renders when count changes.
 */
export function useSelectionCount(): number {
  return useSelectionStore((state) => state.selectedFields.length);
}

/**
 * Hook that returns anchor field info. Only re-renders when anchor changes.
 */
export function useSelectionAnchor() {
  const anchorFieldId = useSelectionStore((state) => state.anchorFieldId);
  const anchorSource = useSelectionStore((state) => state.anchorSource);
  return { anchorFieldId, anchorSource };
}
