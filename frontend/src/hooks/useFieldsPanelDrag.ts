// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, DragEvent } from 'react';
import { useSelectionStore } from '../stores/selectionStore';
import { getDragData, readDragPayload } from '../utils/dragDataStore';

/**
 * Custom hook to handle drag and drop operations in the fields panel
 * @param onRemoveFromAxis Function to call when removing a single field from an axis
 * @param onRemoveMultipleFromAxis Optional function to call when removing multiple fields (batched)
 */
export function useFieldsPanelDrag(
  onRemoveFromAxis: (fieldId: string) => void,
  onRemoveMultipleFromAxis?: (fieldIds: string[]) => void,
  onRemoveFromFilter?: (fieldIds: string[]) => void,
  onRemoveFromColor?: (fieldIds: string[]) => void,
  onRemoveFromSize?: (fieldIds: string[]) => void,
  onRemoveFromLabel?: (fieldIds: string[]) => void,
  onRemoveFromTooltip?: (fieldIds: string[]) => void,
  onRemoveFromMeasureGroup?: (fieldIds: string[]) => void,
  onRemoveFromBackground?: (fieldIds: string[]) => void,
  onRemoveFromShape?: (fieldIds: string[]) => void
) {
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Get clearSelection action (stable reference, never causes re-render)
  const clearSelection = useSelectionStore((s: any) => s.clearSelection);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    try {
      // Show visual feedback for any removable source (everything except AVAILABLE_FIELDS)
      const payload = getDragData();
      if (payload && payload.source && payload.source !== 'AVAILABLE_FIELDS') {
        setIsDragOver(true);
      }
    } catch (error) {
      // Ignore parsing errors during drag over
      // This is expected since we can't access data during dragover in some browsers
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Check if we're actually leaving the element (not entering a child element)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    try {
      const data = readDragPayload(e.dataTransfer);
      if (!data) return;
      
      const fields = data.fields;
      const source = data.source;
      
      if (!source || source === 'AVAILABLE_FIELDS' || !fields || fields.length === 0) {
        return;
      }

      const fieldIds = fields.map((f: any) => f.id);

      if (source === 'X_AXIS' || source === 'Y_AXIS') {
        // Use batch removal for multiple fields to avoid race conditions
        if (fieldIds.length > 1 && onRemoveMultipleFromAxis) {
          onRemoveMultipleFromAxis(fieldIds);
        } else {
          fieldIds.forEach(onRemoveFromAxis);
        }
      } else if (source === 'FILTER_ZONE') {
        onRemoveFromFilter?.(fieldIds);
      } else if (source === 'COLOR_ZONE') {
        onRemoveFromColor?.(fieldIds);
      } else if (source === 'SIZE_ZONE') {
        onRemoveFromSize?.(fieldIds);
      } else if (source === 'LABEL_ZONE') {
        onRemoveFromLabel?.(fieldIds);
      } else if (source === 'TOOLTIP_ZONE') {
        onRemoveFromTooltip?.(fieldIds);
      } else if (source === 'MEASURE_GROUP') {
        onRemoveFromMeasureGroup?.(fieldIds);
      } else if (source === 'BACKGROUND_ZONE') {
        onRemoveFromBackground?.(fieldIds);
      } else if (source === 'SHAPE_ZONE') {
        onRemoveFromShape?.(fieldIds);
      }

      // Clear selection after successful removal
      clearSelection();
    } catch (error) {
      console.error('Error processing drop event:', error);
    }
  };

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
