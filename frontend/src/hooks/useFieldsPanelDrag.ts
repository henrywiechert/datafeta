// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, DragEvent } from 'react';
import { useSelectionStore } from '../stores/selectionStore';
import { getDragData, readDragPayload } from '../utils/dragDataStore';

/**
 * Removes the given fields from the zone they were dragged out of. `source` is
 * the drag payload's source as received, so unknown values must be ignored.
 */
export type RemoveFromZone = (source: string, fieldIds: string[]) => void;

/**
 * Custom hook to handle drag and drop operations in the fields panel.
 * Dropping chips dragged out of any zone removes them from that zone in one
 * `onRemoveFromZone` call, so a multi-field drag lands as a single update.
 */
export function useFieldsPanelDrag(onRemoveFromZone: RemoveFromZone) {
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

      onRemoveFromZone(source, fields.map((f: any) => f.id));

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
