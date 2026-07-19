// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import * as Plot from '@observablehq/plot';
import { GridResultModel, getPlotGridCellById } from '../../../observable-plot-generator/gridModel';
import ObservablePlot from '../ObservablePlot';
import { formatNumericTick, isContinuousNumericDomain } from '../../../observable-plot-generator/utils/numericTickFormat';
import { computeZoomBandXAxis, computeZoomBandYAxis } from './utils/layoutUtils';

/**
 * Default a continuous numeric axis to the compact SI tick formatter, matching
 * the external gutter axes (XAxes/YAxes). The zoom dialog renders the cell's
 * own scale options directly, so without this large values would fall back to
 * Observable Plot defaults (full numbers) here.
 */
function withCompactNumericTicks(axisOptions: any): any {
  if (!axisOptions || axisOptions.tickFormat !== undefined) return axisOptions;
  if (!isContinuousNumericDomain(axisOptions.domain, axisOptions.type)) return axisOptions;
  return { ...axisOptions, tickFormat: formatNumericTick };
}

interface FacetZoomDialogProps {
  grid: GridResultModel;
  plotId: string | null;
  onClose: () => void;
  autoExpandPinnedComparison?: boolean;
  onAutoExpandPinnedComparisonChange?: (enabled: boolean) => void;
}

/**
 * Modal overlay that enlarges a single facet cell for closer inspection.
 * Renders the cell's original plot options (axes intact, no suppressAxes).
 * No filter changes, no re-query — purely a client-side view.
 */
const FacetZoomDialog: React.FC<FacetZoomDialogProps> = ({
  grid,
  plotId,
  onClose,
  autoExpandPinnedComparison,
  onAutoExpandPinnedComparisonChange,
}) => {
  const cell = getPlotGridCellById(grid, plotId);

  if (!cell) return null;

  // Strip explicit margins AND intrinsic width/height from the grid-optimised
  // options. Grid cells size themselves via CSS grid tracks (bar/tick-strip) or
  // baked-in width/height (box-plot); in the dialog we want every chart type to
  // fill the container instead, so we drop those and let ObservablePlot use the
  // observed dialog size.
  const {
    marginLeft: _ml,
    marginRight: _mr,
    marginTop: _mt,
    marginBottom: _mb,
    width: _w,
    height: _h,
    ...restOptions
  } = cell.content.options as any;
  const xAxis = withCompactNumericTicks(restOptions.x);
  const yAxis = withCompactNumericTicks(restOptions.y);

  // Band Y (horizontal charts): size left margin from longest label + ellipsis.
  const yIsBand = yAxis?.type === 'band' && Array.isArray(yAxis?.domain);
  const bandY = yIsBand ? computeZoomBandYAxis(yAxis.domain) : null;
  const marginLeft = bandY ? bandY.marginPx : 80;

  // Band X (vertical charts): horizontal labels with single-line ellipsis.
  // Clears any char-truncating tickFormat from bar options.
  const xIsBand = xAxis?.type === 'band' && Array.isArray(xAxis?.domain);
  const bandX = xIsBand
    ? computeZoomBandXAxis(Array.isArray(xAxis.domain) ? xAxis.domain.length : 1)
    : null;
  const marginBottom = bandX ? bandX.marginBottomPx : 50;

  const bandAxisMarks: Plot.Markish[] = [];
  if (bandY) {
    bandAxisMarks.push(
      Plot.axisY({
        textOverflow: 'ellipsis',
        lineWidth: bandY.lineWidthEm,
        title: (d: unknown) => String(d ?? ''),
      } as any),
    );
  }
  if (bandX) {
    bandAxisMarks.push(
      Plot.axisX({
        textOverflow: 'ellipsis',
        lineWidth: bandX.lineWidthEm,
        marginBottom: bandX.marginBottomPx,
        title: (d: unknown) => String(d ?? ''),
      } as any),
    );
  }

  const zoomedOptions: Plot.PlotOptions = {
    ...restOptions,
    ...(xAxis ? { x: bandX ? { ...xAxis, axis: null, tickFormat: undefined } : xAxis } : {}),
    ...(yAxis ? { y: bandY ? { ...yAxis, axis: null } : yAxis } : {}),
    ...(bandAxisMarks.length > 0
      ? { marks: [...(restOptions.marks ?? []), ...bandAxisMarks] }
      : {}),
    marginLeft,
    marginBottom,
    style: { ...(restOptions.style ?? {}), fontSize: '14px' },
  };

  return (
    <Dialog
      open={true}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      PaperProps={{ sx: { height: '80vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        {cell.metadata?.title || 'Facet zoom'}
        <IconButton size="small" onClick={onClose} aria-label="Close zoom">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 2, overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <ObservablePlot
            options={zoomedOptions}
            plotId={`zoom-${cell.id}`}
            autoExpandPinnedComparison={autoExpandPinnedComparison}
            onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FacetZoomDialog;
