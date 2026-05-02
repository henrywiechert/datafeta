/**
 * Hooks - Custom React hooks for the Data Slicer frontend
 *
 * Legacy aggregate export kept for compatibility.
 *
 * Import convention: new code should import hooks from their concrete files
 * (for example `../hooks/useGlobalFilters`) so cross-feature dependencies stay
 * visible in the import graph. Do not add new exports here unless a caller
 * already depends on this aggregate module.
 */

// Visualization state hooks
export { useVisualizationState } from './useVisualizationState';
export { useRenderingCoordinator } from './useRenderingCoordinator';

// Field and metadata hooks
export { useFieldOperations } from './useFieldOperations';
export { useMetadata } from './useMetadata';
export { useMetadataOperations } from './useMetadataOperations';
export { useFilterMetadata } from './useFilterMetadata';
export { useVirtualColumns } from './useVirtualColumns';
export { useGlobalFilters } from './useGlobalFilters';

// Drag and drop hooks
export { useDragDrop } from './useDragDrop';
export { useFieldsPanelDrag } from './useFieldsPanelDrag';

// Layout and UI hooks
export { useLayoutState } from './useLayoutState';
export { useChartTooltip } from './useChartTooltip';

// Connection hooks
export { useConnectionForm } from './useConnectionForm';

// Undo/redo hooks
export { useUndoRedo } from './useUndoRedo';

// Sheet caching hooks
export { useSheetCacheSave, useSheetCacheRestore, useSheetCacheGridUpdate, useChartAreaCache } from './useSheetCacheCoordinator';
export { useSheetRenderCache } from './useSheetRenderCache';
