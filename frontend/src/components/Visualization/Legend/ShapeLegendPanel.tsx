// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { deriveShapeScaleInfo, ShapeScaleInfo } from '../../../observable-plot-generator/utils/shapeUtils';
import ContextMenu from '../ContextMenu';
import menuStyles from '../ContextMenu.module.css';
import styles from './LegendPanel.module.css';
import ShapeSymbolPreview from '../ShapeSymbolPreview';

export type LegendFilterAction = 'keep' | 'exclude';

interface ShapeLegendPanelProps {
  shapeField: Field | null;
  queryResult: QueryResult | null;
  onFilterAction?: (action: LegendFilterAction, values: any[], allDomainValues: any[]) => void;
  onHighlightChange?: (values: any[] | null) => void;
  clearSelectionRef?: React.MutableRefObject<(() => void) | null>;
}

const ShapeLegendPanel: React.FC<ShapeLegendPanelProps> = ({
  shapeField,
  queryResult,
  onFilterAction,
  onHighlightChange,
  clearSelectionRef,
}) => {
  const scaleInfo = useMemo<ShapeScaleInfo | null>(() => {
    if (!shapeField || !queryResult?.rows?.length) return null;
    return deriveShapeScaleInfo(queryResult.rows, shapeField);
  }, [shapeField, queryResult]);

  const items = useMemo(() => scaleInfo?.legendEntries ?? [], [scaleInfo]);

  /** Raw domain values, including values represented by the Other bucket. */
  const allDomainValues = useMemo(() => scaleInfo?.allValues ?? [], [scaleInfo]);

  const isInteractive = Boolean((onFilterAction || onHighlightChange) && items.length > 0);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleItemClick = useCallback((e: React.MouseEvent, index: number) => {
    if (!isInteractive) return;
    const isMulti = e.ctrlKey || e.metaKey;
    setSelectedIndices(prev => {
      if (isMulti) {
        const next = new Set(prev);
        next.has(index) ? next.delete(index) : next.add(index);
        return next;
      }
      if (prev.size === 1 && prev.has(index)) return new Set<number>();
      return new Set([index]);
    });
    if (!e.ctrlKey && !e.metaKey) setMenuPosition(null);
  }, [isInteractive]);

  const handleItemContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    if (!isInteractive) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedIndices(prev => (prev.has(index) ? prev : new Set([index])));
    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, [isInteractive]);

  const closeMenu = useCallback(() => setMenuPosition(null), []);

  /** Selected raw values, expanding the Other bucket to the values it represents. */
  const selectedValues = useMemo(() => {
    return Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .flatMap(i => {
        const itemValue = items[i]?.value;
        if (itemValue === 'Other') {
          return scaleInfo?.otherValues ?? [];
        }
        return itemValue === undefined ? [] : [itemValue];
      });
  }, [selectedIndices, items, scaleInfo]);

  const handleKeepOnly = useCallback(() => {
    onFilterAction?.('keep', selectedValues, allDomainValues);
    setMenuPosition(null);
    setSelectedIndices(new Set());
  }, [onFilterAction, selectedValues, allDomainValues]);

  const handleExclude = useCallback(() => {
    onFilterAction?.('exclude', selectedValues, allDomainValues);
    setMenuPosition(null);
    setSelectedIndices(new Set());
  }, [onFilterAction, selectedValues, allDomainValues]);

  useEffect(() => {
    if (!onHighlightChange) return;
    if (selectedIndices.size === 0) {
      onHighlightChange(null);
    } else {
      const values = Array.from(selectedIndices)
        .sort((a, b) => a - b)
        .flatMap(i => {
          const itemValue = items[i]?.value;
          if (itemValue === 'Other') {
            return scaleInfo?.otherValues ?? [];
          }
          return itemValue === undefined ? [] : [itemValue];
        });
      onHighlightChange(values.length > 0 ? values : null);
    }
  }, [selectedIndices, items, onHighlightChange, scaleInfo]);

  useEffect(() => {
    if (!clearSelectionRef) return;
    clearSelectionRef.current = () => {
      setSelectedIndices(new Set());
      setMenuPosition(null);
    };
    return () => { clearSelectionRef.current = null; };
  }, [clearSelectionRef]);

  if (!shapeField || items.length === 0) return null;

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography variant="subtitle2" className={styles.title}>
          Shape: {getFieldDisplayName(shapeField)}
        </Typography>
      </Box>
      <Box className={styles.content}>
        {items.map((item, index) => {
          const isSelected = selectedIndices.has(index);
          const itemClasses = [
            styles.legendItem,
            isInteractive ? styles.legendItemInteractive : '',
            isSelected ? styles.legendItemSelected : '',
          ].filter(Boolean).join(' ');

          return (
            <Box
              key={`${item.label}-${index}`}
              className={itemClasses}
              onClick={(e) => handleItemClick(e, index)}
              onContextMenu={(e) => handleItemContextMenu(e, index)}
            >
              <Box sx={{ color: 'text.primary', lineHeight: 0, flexShrink: 0 }}>
                <ShapeSymbolPreview symbol={item.symbol} fontSize="small" />
              </Box>
              <Tooltip title={item.label} placement="right" arrow enterDelay={800}>
                <Typography className={styles.legendLabel}>{item.label}</Typography>
              </Tooltip>
            </Box>
          );
        })}
      </Box>

      {menuPosition && selectedIndices.size > 0 && (
        <ContextMenu position={menuPosition} onClose={closeMenu}>
          <div className={menuStyles.menuItem} onClick={handleKeepOnly}>
            Keep only
          </div>
          <div className={menuStyles.menuItem} onClick={handleExclude}>
            Exclude
          </div>
        </ContextMenu>
      )}
    </Box>
  );
};

export default ShapeLegendPanel;
