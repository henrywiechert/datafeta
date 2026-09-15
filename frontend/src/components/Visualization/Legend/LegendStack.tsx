// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import styles from './LegendStack.module.css';

interface LegendStackProps {
  children: React.ReactNode;
}

/**
 * Scroll container for the stacked legend panels.
 *
 * Owns no sizing: the legend is a real `Panel` in ChartArea's horizontal group,
 * so its width, constraints, drag gesture and per-sheet persistence all come
 * from react-resizable-panels and the shared `SplitHandle`. This component used
 * to carry its own pixel width in `useState` plus a bespoke resize handle,
 * which is why the legend was the one boundary in the app that resized live
 * while every other one committed on release.
 */
const LegendStack: React.FC<LegendStackProps> = ({ children }) => (
  <div className={styles.stackContainer}>
    <div className={styles.stackContent}>
      {children}
    </div>
  </div>
);

export default LegendStack;
