// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useRef, useState } from 'react';
import SplitHandle from '../../Layout/SplitHandle';
import { SplitBounds } from '../../Layout/useSplitDrag';
import styles from './LegendStack.module.css';

interface LegendStackProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Called with the final width when a resize drag ends (used to persist per-sheet). */
  onWidthCommit?: (width: number) => void;
}

const LegendStack: React.FC<LegendStackProps> = ({
  children,
  defaultWidth = 220,
  minWidth = 180,
  maxWidth = 320,
  onWidthCommit,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(defaultWidth);

  const getBounds = useCallback((): SplitBounds => ({
    currentPx: widthRef.current,
    minPx: minWidth,
    maxPx: maxWidth,
  }), [maxWidth, minWidth]);

  // The legend used to resize live on every mousemove while the panels around
  // it committed on release. It now shares the app's single deferred gesture.
  const handleCommit = useCallback((nextWidth: number) => {
    const rounded = Math.round(nextWidth);
    widthRef.current = rounded;
    setWidth(rounded);
    onWidthCommit?.(rounded);
  }, [onWidthCommit]);

  return (
    <div className={styles.stackContainer} style={{ width }}>
      <div className={styles.handleSlot}>
        <SplitHandle
          orientation="vertical"
          panelSide="after"
          ariaLabel="Resize legend"
          getBounds={getBounds}
          onCommitPx={handleCommit}
        />
      </div>
      <div className={styles.stackContent}>
        {children}
      </div>
    </div>
  );
};

export default LegendStack;
