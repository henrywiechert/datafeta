// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState } from 'react';
import { Field, DragSource } from '../../types';
import FieldChip from './FieldChip';
import { useSelectionStore } from '../../stores/selectionStore';
import { readDragPayload } from '../../utils/dragDataStore';
import styles from './DropZone.module.css';

/**
 * TableColumnsDropZone
 *
 * Dedicated, ordered column list for the first-class table view. Unlike the
 * axis DropZone, it has no discrete-before-continuous ordering constraint: the
 * order of chips is exactly the column order. Accepts drops from the available
 * fields tree and supports in-zone reordering plus per-chip removal.
 */

const STYLES = {
  container: { display: 'flex' },
  label: {
    fontWeight: 'normal' as const,
    marginRight: '5px',
    minWidth: '6px',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
  },
  dropArea: {
    flex: 1,
    padding: '2px 4px',
    minHeight: '28px',
    display: 'flex',
    alignItems: 'center',
  },
  fieldsWrapper: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '2px',
    position: 'relative' as const,
    width: '100%',
  },
  dropIndicator: {
    width: '2px',
    height: '24px',
    backgroundColor: '#1976d2',
    zIndex: 1000,
  },
  emptyMessage: {
    color: '#666',
    fontStyle: 'italic' as const,
    fontSize: '12px',
    padding: '1px 0',
  },
} as const;

function parseDragData(dataTransfer: DataTransfer): { fields: Field[]; source: DragSource; indices: number[] } | null {
  const payload = readDragPayload(dataTransfer);
  if (payload) {
    return {
      fields: payload.fields,
      source: payload.source as DragSource,
      indices: payload.indices,
    };
  }
  return null;
}

interface TableColumnsDropZoneProps {
  children?: React.ReactNode;
  fields: Field[];
  onDrop: (field: Field | Field[], source: DragSource, index?: number) => void;
  onFieldUpdate: (fields: Field | Field[]) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
}

const TableColumnsDropZone: React.FC<TableColumnsDropZoneProps> = ({
  children,
  fields,
  onDrop,
  onFieldUpdate,
  onRemoveField,
  onReorderFields,
}) => {
  const [isOver, setIsOver] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragLeaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const clearSelection = useSelectionStore((s: any) => s.clearSelection);

  React.useEffect(() => {
    const handleGlobalDragEnd = () => {
      setIsOver(false);
      setDragOverIndex(null);
      if (dragLeaveTimeoutRef.current) {
        clearTimeout(dragLeaveTimeoutRef.current);
        dragLeaveTimeoutRef.current = null;
      }
    };
    document.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
      if (dragLeaveTimeoutRef.current) {
        clearTimeout(dragLeaveTimeoutRef.current);
      }
    };
  }, []);

  const calculateDropIndexFromMouse = (mouseX: number, containerElement: EventTarget & Element): number => {
    const fieldChips = containerElement.querySelectorAll('.field-chip');
    if (fieldChips.length === 0) return 0;

    const firstChipRect = (fieldChips[0] as HTMLElement).getBoundingClientRect();
    if (mouseX < firstChipRect.left) return 0;

    for (let i = 0; i < fieldChips.length; i++) {
      const chipRect = (fieldChips[i] as HTMLElement).getBoundingClientRect();
      const chipCenter = chipRect.left + chipRect.width / 2;
      if (mouseX < chipCenter) return i;
    }
    return fields.length;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragLeaveTimeoutRef.current) {
      clearTimeout(dragLeaveTimeoutRef.current);
      dragLeaveTimeoutRef.current = null;
    }
    setIsOver(true);
    setDragOverIndex(calculateDropIndexFromMouse(e.clientX, e.currentTarget));
  };

  const handleDragLeave = () => {
    dragLeaveTimeoutRef.current = setTimeout(() => {
      setIsOver(false);
      setDragOverIndex(null);
    }, 50);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    setDragOverIndex(null);

    const data = parseDragData(e.dataTransfer);
    if (!data || data.fields.length === 0) return;

    const { fields: draggedFields, source, indices } = data;
    const sourceIndex = indices.length > 0 && indices[0] >= 0 ? indices[0] : undefined;
    let targetIndex = calculateDropIndexFromMouse(e.clientX, e.currentTarget);

    // In-zone reorder (single field).
    if (source === 'TABLE_ZONE' && sourceIndex !== undefined && draggedFields.length === 1) {
      if (targetIndex > sourceIndex) {
        targetIndex = Math.max(targetIndex - 1, sourceIndex);
      }
      if (targetIndex !== sourceIndex) {
        onReorderFields(sourceIndex, targetIndex);
      }
      clearSelection();
      return;
    }

    // Drops from the available fields tree (or other zones): copy in.
    onDrop(draggedFields, source, targetIndex);
    clearSelection();
  };

  const dropZoneClass = `${styles.dropZone} ${isOver ? styles.isOver : ''}`;

  return (
    <div style={STYLES.container}>
      <div style={STYLES.label}>{children}</div>
      <div
        className={dropZoneClass}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={STYLES.dropArea}
      >
        <div style={STYLES.fieldsWrapper}>
          {fields.map((field, index) => (
            <React.Fragment key={field.id}>
              {dragOverIndex === index && <div style={STYLES.dropIndicator} />}
              <FieldChip
                field={field}
                onUpdate={onFieldUpdate}
                source="TABLE_ZONE"
                index={index}
                allFields={fields}
                onRemoveFromZone={(ids) => {
                  ids.forEach(onRemoveField);
                }}
              />
            </React.Fragment>
          ))}
          {dragOverIndex === fields.length && <div style={STYLES.dropIndicator} />}
        </div>
        {fields.length === 0 && (
          <div style={STYLES.emptyMessage}>Drop fields here to add columns</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(TableColumnsDropZone, (prev, next) => (
  prev.fields === next.fields &&
  prev.onDrop === next.onDrop &&
  prev.onFieldUpdate === next.onFieldUpdate &&
  prev.onRemoveField === next.onRemoveField &&
  prev.onReorderFields === next.onReorderFields
));
