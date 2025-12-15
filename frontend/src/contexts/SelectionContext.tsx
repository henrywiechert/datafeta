import React, { ReactNode } from 'react';
import { useSelectionStore, type SelectionStore, type SelectedField } from '../stores/selectionStore';
import { Field, DragSource } from '../types';

/**
 * SelectionContext - Compatibility layer over Zustand store
 * 
 * This file now provides backward-compatible hooks that delegate to the
 * Zustand selection store. The store provides granular subscriptions,
 * so components can subscribe to only the data they need.
 * 
 * For new code, prefer using the Zustand store directly:
 * - useSelectionStore() - full store access
 * - useIsFieldSelected(fieldId, source) - granular subscription for single field
 * - useSelectionCount() - subscribe to count only
 */

// Re-export types for backward compatibility
export type { SelectedField };

/**
 * @deprecated Use useSelectionStore or useIsFieldSelected from '../stores' instead.
 * This hook causes re-renders on ANY selection change.
 * 
 * For performance with many fields, use:
 * - useIsFieldSelected(fieldId, source) - only re-renders when this field's status changes
 * - useSelectionStore.getState() - read state without subscribing (in event handlers)
 */
export const useSelection = (): SelectionStore => {
  // Return the entire store - this will cause re-renders on any selection change
  // For better performance, use useIsFieldSelected or other granular hooks
  return useSelectionStore();
};

/**
 * SelectionProvider - No longer needed but kept for backward compatibility.
 * Zustand stores don't require a provider.
 */
interface SelectionProviderProps {
  children: ReactNode;
}

export const SelectionProvider: React.FC<SelectionProviderProps> = ({ children }) => {
  // Simply render children - Zustand store is global and doesn't need a provider
  return <>{children}</>;
};
