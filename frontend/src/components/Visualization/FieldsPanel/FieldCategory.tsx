// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { Typography, Box } from '@mui/material';
import { List } from 'react-window';
import FieldChip from '../FieldChip/index';
import { Field } from '../../../types';
import styles from './FieldsPanel.module.css';

interface FieldCategoryProps {
  title: string;
  fields: Field[];
  onUpdate: (fields: Field | Field[]) => void;
  onCreateBins?: (field: Field) => void;
}

// Use virtualization if more than this many fields
// Lower threshold since full-width chips cause more reflow during resize
const VIRTUALIZATION_THRESHOLD = 50;
const ITEM_HEIGHT = 21; // Height of each field chip (20px chip + 1px margin)

// Stable style object for virtualized rows (defined outside component to avoid recreation)
const ROW_BASE_STYLE = {
  paddingBottom: 0,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'flex-start' as const,
  width: '100%',
  boxSizing: 'border-box' as const,
  // contain removed to prevent z-index stacking issues with context menus
};

// Per-row data handed to the virtualized row via react-window's `rowProps`.
type FieldRowProps = {
  fields: Field[];
  onUpdate: (fields: Field | Field[]) => void;
  onCreateBins?: (field: Field) => void;
};

// Row renderer for the virtualized list.
//
// This MUST be a stable module-level component. react-window renders
// `<rowComponent .../>`, so if this function's identity changed each render
// (e.g. an inline component), React would treat every row as a new element
// type and unmount + remount all rows on every parent re-render. With MUI
// Tooltips inside each FieldChip, that tear-down floods the commit phase with
// clearTimeout calls and blocks the main thread for seconds. Data flows in via
// `rowProps`; only `index`/`style` come from react-window itself.
const FieldRow = ({
  index,
  style,
  fields,
  onUpdate,
  onCreateBins,
}: { index: number; style: React.CSSProperties } & FieldRowProps) => {
  const field = fields[index];
  return (
    <div style={{ ...style, ...ROW_BASE_STYLE }}>
      <FieldChip
        field={field}
        onUpdate={onUpdate}
        source="AVAILABLE_FIELDS"
        allFields={fields}
        onCreateBins={onCreateBins}
      />
    </div>
  );
};

const FieldCategory: React.FC<FieldCategoryProps> = ({ title, fields, onUpdate, onCreateBins }) => {
  // Use virtualization for large lists
  const useVirtualization = fields.length > VIRTUALIZATION_THRESHOLD;

  // Key rows by field id so react-window preserves row identity across
  // sort/filter reorders instead of remounting by positional index. Must be a
  // stable useCallback per react-window's contract (it is called during render).
  const rowKey = useCallback(
    (index: number, data: FieldRowProps) => data.fields[index].id,
    [],
  );

  if (useVirtualization) {
    // Virtualized rendering for performance with many fields. The list must be
    // bounded: without a height it grows to fit its content and mounts every
    // row, defeating virtualization. The bound comes from flex layout (see
    // `.fieldsList > .fieldCategory`): the list box asks for its full content
    // height and shrinks into this category's share of the panel. The List
    // fills that box and measures itself (react-window v2 observes its own
    // size); `defaultHeight` only covers the first render.
    const contentHeight = fields.length * ITEM_HEIGHT;

    return (
      <Box className={styles.fieldCategory}>
        <Typography variant="subtitle2" className={styles.categoryTitle}>
          {title} ({fields.length})
        </Typography>
        <Box className={styles.virtualListBox} style={{ height: contentHeight }}>
          <List
            defaultHeight={Math.min(contentHeight, 600)}
            rowCount={fields.length}
            rowHeight={ITEM_HEIGHT}
            rowComponent={FieldRow}
            rowProps={{ fields, onUpdate, onCreateBins }}
            rowKey={rowKey}
            style={{
              height: '100%',
              overflowX: 'hidden',
              willChange: 'transform', // Hint browser for smooth scrolling
            }}
          />
        </Box>
      </Box>
    );
  }

  // Standard rendering for small lists
  return (
    <Box className={styles.fieldCategory}>
      <Typography variant="subtitle2" className={styles.categoryTitle}>
        {title} ({fields.length})
      </Typography>
      <Box className={styles.fieldsContainer}>
        {fields.map(field => (
          <FieldChip 
            key={field.id} 
            field={field} 
            onUpdate={onUpdate}
            source="AVAILABLE_FIELDS"
            allFields={fields}
            onCreateBins={onCreateBins}
          />
        ))}
        {fields.length === 0 && (
          <Typography variant="body2" className={styles.emptyMessage}>
            No {title.toLowerCase()} available
          </Typography>
        )}
      </Box>
    </Box>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
// Only re-render if title, fields array, or onUpdate callback changes
export default React.memo(FieldCategory);
