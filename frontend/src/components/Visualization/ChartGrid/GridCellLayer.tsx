// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { GridResultModel } from '../../../observable-plot-generator/gridModel';
import { buildPlotGridSizingStyle } from './utils/layoutUtils';

interface GridCellLayerProps {
  grid: GridResultModel;
  layerRef?: React.Ref<HTMLDivElement>;
  plotTemplateColumns: string;
  plotRowsSpec: string;
  totalContentWidthPx: number;
  /** Render function called for each cell. Implementations dispatch on cell.content.kind. */
  renderCell: (cell: GridResultModel['cells'][number], index: number) => React.ReactNode;
  /** Optional extra style applied to the wrapping CSS-grid container. */
  style?: React.CSSProperties;
}

/**
 * Generic CSS-grid wrapper that lays out one child per `GridCellModel`.
 * Owns the grid template / sizing only — content rendering is delegated to
 * the `renderCell` callback. This enables a single layout pipeline for all
 * cell kinds (plot / text / mark / empty / pie) added in subsequent PRs.
 */
const GridCellLayer: React.FC<GridCellLayerProps> = ({
  grid,
  layerRef,
  plotTemplateColumns,
  plotRowsSpec,
  totalContentWidthPx,
  renderCell,
  style,
}) => {
  return (
    <div
      ref={layerRef}
      style={{
        ...buildPlotGridSizingStyle({
          plotTemplateColumns,
          plotRowsSpec,
          totalContentWidthPx,
          columnSizes: grid.layout.columnSizes,
        }),
        ...(style || {}),
      }}
    >
      {grid.cells.map((cell, index) => renderCell(cell, index))}
    </div>
  );
};

export default GridCellLayer;
