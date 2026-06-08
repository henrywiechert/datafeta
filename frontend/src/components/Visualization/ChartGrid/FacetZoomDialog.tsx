// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import * as Plot from '@observablehq/plot';
import { GridResultModel, getPlotGridCellById } from '../../../observable-plot-generator/gridModel';
import ObservablePlot from '../ObservablePlot';
import { MapPanZoomHandlers } from '../map/attachMapPanZoom';

interface FacetZoomDialogProps {
  grid: GridResultModel;
  plotId: string | null;
  onClose: () => void;
  mapPanZoom?: MapPanZoomHandlers;
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
  mapPanZoom,
  autoExpandPinnedComparison,
  onAutoExpandPinnedComparisonChange,
}) => {
  const cell = getPlotGridCellById(grid, plotId);

  if (!cell) return null;

  const { marginLeft: _ml, marginRight: _mr, marginTop: _mt, marginBottom: _mb, ...restOptions } = cell.content.options as any;
  const zoomedOptions: Plot.PlotOptions = {
    ...restOptions,
    marginLeft: 80,
    marginBottom: 50,
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
            mapPanZoom={mapPanZoom}
            autoExpandPinnedComparison={autoExpandPinnedComparison}
            onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FacetZoomDialog;
