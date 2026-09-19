// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';

interface AxisGlyphProps {
  /** Which axis is the drop zone — that arm is thick; the other is dotted. */
  emphasis: 'x' | 'y';
}

const OX = 3.5;
const OY = 13.5;
const X_END = 13.5;
const Y_END = 2.5;
const DOT_R = 0.8;
const DOT_COUNT = 4;
const INSET_ORIGIN = 2.4;
const INSET_TIP = 1.6;

const xDots = Array.from({ length: DOT_COUNT }, (_, i) => {
  const start = OX + INSET_ORIGIN;
  const end = X_END - INSET_TIP;
  return start + ((end - start) * i) / (DOT_COUNT - 1);
});

const yDots = Array.from({ length: DOT_COUNT }, (_, i) => {
  const start = OY - INSET_ORIGIN;
  const end = Y_END + INSET_TIP;
  return start + ((end - start) * i) / (DOT_COUNT - 1);
});

/**
 * 18px L-shaped coordinate mark. Origin at bottom-left; the emphasized arm is
 * a heavy stroke with an arrow, the other arm is four equal dots.
 */
const AxisGlyph: React.FC<AxisGlyphProps> = ({ emphasis }) => {
  const xStrong = emphasis === 'x';
  const label = xStrong ? 'X axis' : 'Y axis';

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <title>{label}</title>
      {xStrong ? (
        <>
          <line
            x1={OX}
            y1={OY}
            x2={X_END}
            y2={OY}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <polygon points="13.5,13.5 11.2,12.2 11.2,14.8" fill="currentColor" />
          <g fill="currentColor" opacity={0.5}>
            {yDots.map((cy) => (
              <circle key={cy} cx={OX} cy={cy} r={DOT_R} />
            ))}
          </g>
        </>
      ) : (
        <>
          <line
            x1={OX}
            y1={OY}
            x2={OX}
            y2={Y_END}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <polygon points="3.5,2.5 2.2,4.8 4.8,4.8" fill="currentColor" />
          <g fill="currentColor" opacity={0.5}>
            {xDots.map((cx) => (
              <circle key={cx} cx={cx} cy={OY} r={DOT_R} />
            ))}
          </g>
        </>
      )}
    </svg>
  );
};

export default AxisGlyph;
