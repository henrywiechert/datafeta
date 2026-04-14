import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Field, QueryResult } from '../../../types';
import { getFieldDisplayName } from '../../../utils/fieldUtils';
import { deriveShapeScaleInfo, ShapeScaleInfo } from '../../../observable-plot-generator/utils/shapeUtils';
import ContextMenu from '../ContextMenu';
import menuStyles from '../ContextMenu.module.css';
import styles from './LegendPanel.module.css';

export type LegendFilterAction = 'keep' | 'exclude';

interface ShapeLegendPanelProps {
  shapeField: Field | null;
  queryResult: QueryResult | null;
  onFilterAction?: (action: LegendFilterAction, values: any[], allDomainValues: any[]) => void;
  onHighlightChange?: (values: any[] | null) => void;
  clearSelectionRef?: React.MutableRefObject<(() => void) | null>;
}

/** SVG preview of an Observable Plot symbol. */
const SymbolPreview: React.FC<{ symbol: string }> = ({ symbol }) => {
  const size = 12;
  const half = size / 2;

  const shapePath = (): JSX.Element => {
    switch (symbol) {
      case 'circle':
        return <circle cx={half} cy={half} r={4} />;
      case 'square':
        return <rect x={2} y={2} width={8} height={8} />;
      case 'diamond':
        return <polygon points={`${half},1 ${size - 1},${half} ${half},${size - 1} 1,${half}`} />;
      case 'triangle':
        return <polygon points={`${half},1 ${size - 1},${size - 1} 1,${size - 1}`} />;
      case 'star': {
        // 5-pointed star
        const pts: string[] = [];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * i) / 5 - Math.PI / 2;
          const r = i % 2 === 0 ? 5 : 2.5;
          pts.push(`${half + r * Math.cos(angle)},${half + r * Math.sin(angle)}`);
        }
        return <polygon points={pts.join(' ')} />;
      }
      case 'cross':
        return (
          <path d={`M${half - 1.5},1 h3 v${half - 2.5} h${half - 2.5} v3 h${-(half - 2.5)} v${half - 2.5} h-3 v${-(half - 2.5)} h${-(half - 2.5)} v-3 h${half - 2.5} Z`} />
        );
      case 'wye': {
        // Y shape
        const r = 4;
        const pts: string[] = [];
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
          pts.push(`${half + r * Math.cos(a)},${half + r * Math.sin(a)}`);
        }
        return (
          <g>
            {pts.map((p, i) => {
              const [x, y] = p.split(',').map(Number);
              return <line key={i} x1={half} y1={half} x2={x} y2={y} strokeWidth="2.5" />
            })}
            <circle cx={half} cy={half} r={1.5} fill="currentColor" stroke="none" />
          </g>
        );
      }
      case 'asterisk': {
        // 6-spoke asterisk
        const spokes: JSX.Element[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * i) / 6;
          const r2 = 4.5;
          spokes.push(
            <line
              key={i}
              x1={half - r2 * Math.cos(a)}
              y1={half - r2 * Math.sin(a)}
              x2={half + r2 * Math.cos(a)}
              y2={half + r2 * Math.sin(a)}
              strokeWidth="1.8"
            />
          );
        }
        return <g>{spokes}</g>;
      }
      default:
        return <circle cx={half} cy={half} r={4} />;
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, overflow: 'visible' }}
    >
      {shapePath()}
    </svg>
  );
};

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

  /** Raw domain values (excluding the "Other" sentinel). */
  const domainValues = useMemo(() => scaleInfo?.domain ?? [], [scaleInfo]);

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

  /** Selected raw values (exclude the "Other" sentinel from filter logic). */
  const selectedValues = useMemo(() => {
    return Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map(i => items[i]?.value)
      .filter(v => v !== 'Other');
  }, [selectedIndices, items]);

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

  useEffect(() => {
    if (!onHighlightChange) return;
    if (selectedIndices.size === 0) {
      onHighlightChange(null);
    } else {
      const values = Array.from(selectedIndices)
        .sort((a, b) => a - b)
        .map(i => items[i]?.value)
        .filter(v => v !== 'Other');
      onHighlightChange(values.length > 0 ? values : null);
    }
  }, [selectedIndices, items, onHighlightChange]);

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
                <SymbolPreview symbol={item.symbol} />
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
