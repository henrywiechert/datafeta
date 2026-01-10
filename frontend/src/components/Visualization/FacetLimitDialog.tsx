/**
 * FacetLimitDialog - Warning dialog shown when faceting would create too many facets.
 * 
 * Displays a blocking dialog that requires user acknowledgment before proceeding
 * with rendering a visualization that may overwhelm the browser.
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { FacetValidationResult, FACET_LIMIT } from '../../observable-plot-generator/faceting/facetValidation';

interface FacetLimitDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Validation result containing facet counts and field information */
  validationResult: FacetValidationResult | null;
  /** Called when user chooses to proceed despite the warning */
  onProceed: () => void;
  /** Called when user cancels (does not proceed with rendering) */
  onCancel: () => void;
}

/**
 * Formats a number with thousand separators for readability.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Builds a human-readable description of which facet fields are contributing.
 */
function buildFieldDescription(fields: { columnName: string }[]): string {
  if (fields.length === 0) return '';
  if (fields.length === 1) return fields[0].columnName;
  return fields.map(f => f.columnName).join(' × ');
}

const FacetLimitDialog: React.FC<FacetLimitDialogProps> = ({
  open,
  validationResult,
  onProceed,
  onCancel,
}) => {
  if (!validationResult) {
    return null;
  }

  const {
    rowFacetCount,
    colFacetCount,
    rowFacetFields,
    colFacetFields,
    exceedsLimit,
  } = validationResult;

  const totalFacets = rowFacetCount * colFacetCount;
  const rowFieldsDesc = buildFieldDescription(rowFacetFields);
  const colFieldsDesc = buildFieldDescription(colFacetFields);

  // Build the warning message based on which direction exceeds
  let exceedsMessage = '';
  if (exceedsLimit === 'both') {
    exceedsMessage = `Both row facets (${formatNumber(rowFacetCount)}) and column facets (${formatNumber(colFacetCount)}) exceed the recommended limit of ${formatNumber(FACET_LIMIT)}.`;
  } else if (exceedsLimit === 'row') {
    exceedsMessage = `Row facets (${formatNumber(rowFacetCount)}) exceed the recommended limit of ${formatNumber(FACET_LIMIT)}.`;
  } else if (exceedsLimit === 'col') {
    exceedsMessage = `Column facets (${formatNumber(colFacetCount)}) exceed the recommended limit of ${formatNumber(FACET_LIMIT)}.`;
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby="facet-limit-dialog-title"
      aria-describedby="facet-limit-dialog-description"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle
        id="facet-limit-dialog-title"
        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      >
        <WarningAmberIcon color="warning" />
        Large Number of Facets
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="facet-limit-dialog-description" component="div">
          <Alert severity="warning" sx={{ mb: 2 }}>
            {exceedsMessage}
          </Alert>

          <Typography variant="body2" paragraph>
            This visualization would create:
          </Typography>

          <Box sx={{ pl: 2, mb: 2 }}>
            {rowFacetFields.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                • <strong>{formatNumber(rowFacetCount)}</strong> row facets
                {rowFieldsDesc && ` (${rowFieldsDesc})`}
              </Typography>
            )}
            {colFacetFields.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                • <strong>{formatNumber(colFacetCount)}</strong> column facets
                {colFieldsDesc && ` (${colFieldsDesc})`}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              • <strong>{formatNumber(totalFacets)}</strong> total charts to render
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" paragraph>
            Rendering this many charts may cause your browser to become slow or unresponsive.
          </Typography>

          <Typography variant="body2" fontWeight="medium">
            Suggestions to reduce facets:
          </Typography>
          <Box component="ul" sx={{ mt: 0.5, pl: 3, color: 'text.secondary' }}>
            <li>
              <Typography variant="body2">
                Apply filters to reduce the number of unique values
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Move some discrete dimensions to other encodings (color, size)
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Remove discrete dimensions from the axes
              </Typography>
            </li>
          </Box>
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button onClick={onProceed} color="warning" variant="contained">
          Proceed Anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FacetLimitDialog;
