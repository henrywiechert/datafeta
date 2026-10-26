// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef } from 'react';
import type * as Plot from '@observablehq/plot';
import type { ViewportController } from './viewportController';
import { useAxisGutterZoom } from './useViewportGestures';

interface AxisZoomGutterProps {
  /** Options of a plot cell sharing this gutter's axis. */
  options: Plot.PlotOptions | undefined;
  axis: 'x' | 'y';
  controller: ViewportController | undefined;
  independent?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** One external axis gutter track; the zoom wheel over it zooms this axis alone. */
const AxisZoomGutter: React.FC<AxisZoomGutterProps> = ({ options, axis, controller, independent, style, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useAxisGutterZoom({ gutterRef: ref, options, axis, controller, independent });
  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  );
};

export default AxisZoomGutter;
