import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { deriveColorScaleInfo } from '../../../observable-plot-generator/utils/colorSchemeUtils';
import { DEFAULT_CATEGORICAL_SCHEME } from '../../../config/colorSchemes';
import ContextMenu from '../ContextMenu';
import menuStyles from '../ContextMenu.module.css';
import styles from './LegendPanel.module.css';

/** Action the user can perform on the selected legend items. */
export type LegendFilterAction = 'keep' | 'exclude';

interface LegendPanelProps {
  colorField: Field | null;
  queryResult: QueryResult | null;
  colorScheme?: string;
  colorBias?: number;
  /**
   * When provided the discrete legend items become interactive:
   *  - Left-click selects / Ctrl+click multi-selects.
   *  - Right-click on a selected item opens a "Keep only / Exclude" menu.
   *
   * `values` contains the **raw domain values** (not display strings) for the
   * selected items.  `allDomainValues` is the full categorical domain so the
   * caller can compute the inverse set for "Exclude".
   */
  onFilterAction?: (
    action: LegendFilterAction,
    values: any[],
    allDomainValues: any[],
  ) => void;
  /**
   * Fired whenever the set of selected (highlighted) legend categories changes.
   * Receives the raw domain values for the selected items, or `null` when
   * nothing is selected.
   */
  onHighlightChange?: (values: any[] | null) => void;
  /**
   * Imperative handle the parent can use to clear the legend selection from
   * outside (e.g. on Escape key).  Assign `.current` once on mount.
   */
  clearSelectionRef?: React.MutableRefObject<(() => void) | null>;
}

const LegendPanel: React.FC<LegendPanelProps> = ({
  colorField,
  queryResult,
  colorScheme = DEFAULT_CATEGORICAL_SCHEME,
  colorBias = 0,
  onFilterAction,
  onHighlightChange,
  clearSelectionRef,
}) => {
  // ── Colour scale derivation ──────────────────────────────────────────
  const colorScale = useMemo(() => {
    if (!colorField || !queryResult?.rows) {
      return null;
    }
    return deriveColorScaleInfo(queryResult.rows, colorField, colorScheme, colorBias);
  }, [colorField, colorScheme, colorBias, queryResult]);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'number') {
      const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
      return formatter.format(value);
    }
    if (typeof value === 'string') {
      return value;
    }
    return String(value);
  };

  /** Raw domain values from the colour scale (categorical only). */
  const domainValues = useMemo(() => {
    if (!colorScale || colorScale.kind !== 'categorical') return [] as any[];
    return Array.isArray(colorScale.domain) ? colorScale.domain : [];
  }, [colorScale]);

  const discreteItems = useMemo(() => {
    if (!colorField || domainValues.length === 0 || !colorScale) {
      return [] as Array<{ label: string; color: string; value: any }>;
    }
    const range = colorScale.range;
    return domainValues.map((value, index) => ({
      label: formatValue(value),
      color: range[index % range.length],
      value,
    }));
  }, [colorField, colorScale, domainValues]);

  const continuousLegend = useMemo(() => {
    if (!colorField || !colorScale || colorScale.kind !== 'continuous' || colorScale.range.length === 0) {
      return null;
    }
    const domain = colorScale.domain as [number, number];
    const gradient = `linear-gradient(to right, ${colorScale.range.join(', ')})`;
    const minLabel = formatValue(colorScale.rawMin ?? domain[0]);
    const maxLabel = formatValue(colorScale.rawMax ?? domain[1]);
    return { gradient, minLabel, maxLabel };
  }, [colorField, colorScale]);

  // ── Selection state ─────────────────────────────────────────────────
  const isInteractive = Boolean(
    (onFilterAction || onHighlightChange) && discreteItems.length > 0,
  );

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  /** Standard multi-select: click = single select, Ctrl/Cmd+click = toggle. */
  const handleItemClick = useCallback((e: React.MouseEvent, index: number) => {
    if (!isInteractive) return;
    const isMulti = e.ctrlKey || e.metaKey;
    setSelectedIndices(prev => {
      if (isMulti) {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      }
      // Plain click — toggle off if already the sole selection
      if (prev.size === 1 && prev.has(index)) {
        return new Set<number>();
      }
      return new Set([index]);
    });
    // Close any open menu on plain click
    if (!e.ctrlKey && !e.metaKey) {
      setMenuPosition(null);
    }
  }, [isInteractive]);

  /** Right-click on a (selected) item opens the context menu. */
  const handleItemContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    if (!isInteractive) return;
    e.preventDefault();
    e.stopPropagation();

    // If the right-clicked item is not selected, make it the sole selection
    setSelectedIndices(prev => {
      if (prev.has(index)) return prev;
      return new Set([index]);
    });

    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, [isInteractive]);

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  /** Gather raw domain values at selected indices. */
  const selectedValues = useMemo(() => {
    return Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map(i => domainValues[i]);
  }, [selectedIndices, domainValues]);

  const handleKeepOnly = useCallback(() => {
    onFilterAction?.('keep', selectedValues, domainValues);
    setMenuPosition(null);
    setSelectedIndices(new Set());
  }, [onFilterAction, selectedValues, domainValues]);

  const handleExclude = useCallback(() => {
    onFilterAction?.('exclude', selectedValues, domainValues);
    setMenuPosition(null);
    setSelectedIndices(new Set());
  }, [onFilterAction, selectedValues, domainValues]);

  // ── Highlight change notification ─────────────────────────────────────
  useEffect(() => {
    if (!onHighlightChange) return;
    if (selectedIndices.size === 0) {
      onHighlightChange(null);
    } else {
      const values = Array.from(selectedIndices)
        .sort((a, b) => a - b)
        .map((i) => discreteItems[i]?.value);
      onHighlightChange(values.length > 0 ? values : null);
    }
  }, [selectedIndices, discreteItems, onHighlightChange]);

  // ── Imperative clear handle for parent ────────────────────────────────
  useEffect(() => {
    if (!clearSelectionRef) return;
    clearSelectionRef.current = () => {
      setSelectedIndices(new Set());
      setMenuPosition(null);
    };
    return () => { clearSelectionRef.current = null; };
  }, [clearSelectionRef]);

  // ── Render ───────────────────────────────────────────────────────────
  if (!colorField || (!discreteItems.length && !continuousLegend)) {
    return null;
  }

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography variant="subtitle2" className={styles.title}>
          Color: {getFieldDisplayName(colorField)}
        </Typography>
      </Box>
      <Box className={styles.content}>
        {continuousLegend ? (
          <Box className={styles.gradientLegend}>
            <Box className={styles.gradientBar} sx={{ backgroundImage: continuousLegend.gradient }} />
            <Box className={styles.gradientLabels}>
              <Typography className={styles.gradientLabel}>{continuousLegend.minLabel}</Typography>
              <Typography className={styles.gradientLabel}>{continuousLegend.maxLabel}</Typography>
            </Box>
          </Box>
        ) : (
          discreteItems.map((item, index) => {
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
                <Box
                  className={styles.colorSwatch}
                  sx={{ backgroundColor: item.color }}
                />
                <Tooltip title={item.label} placement="right" arrow enterDelay={800}>
                  <Typography className={styles.legendLabel}>
                    {item.label}
                  </Typography>
                </Tooltip>
              </Box>
            );
          })
        )}
      </Box>

      {/* Context menu for "Keep only" / "Exclude" */}
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

export default LegendPanel;

