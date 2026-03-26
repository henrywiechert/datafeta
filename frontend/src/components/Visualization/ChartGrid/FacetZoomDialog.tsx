import React from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import * as Plot from '@observablehq/plot';
import { PlotResult } from '../../../observable-plot-generator/types';
import ObservablePlot from '../ObservablePlot';

interface FacetZoomDialogProps {
  spec: PlotResult;
  plotId: string | null;
  onClose: () => void;
}

/**
 * Modal overlay that enlarges a single facet cell for closer inspection.
 * Renders the cell's original plot options (axes intact, no suppressAxes).
 * No filter changes, no re-query — purely a client-side view.
 */
const FacetZoomDialog: React.FC<FacetZoomDialogProps> = ({ spec, plotId, onClose }) => {
  const plot = plotId ? spec.plots.find((p) => p.id === plotId) : null;

  if (!plot) return null;

  // Strip explicit margins from the grid-optimised options.
  // Observable Plot auto-computes margins from tick label character count using ~6.5px/char
  // (calibrated for its default 10px font). At 14px that under-estimates by 40%, so we
  // supply an explicit marginLeft sized for 14px: ~9px/char × up to 8 chars + 8px padding.
  const { marginLeft: _ml, marginRight: _mr, marginTop: _mt, marginBottom: _mb, ...restOptions } = plot.options as any;
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
        {plot.title || 'Facet zoom'}
        <IconButton size="small" onClick={onClose} aria-label="Close zoom">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 2, overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <ObservablePlot
            options={zoomedOptions}
            plotId={`zoom-${plot.id}`}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FacetZoomDialog;
