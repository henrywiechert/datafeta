// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * FacetLimitDialog - Warning dialog shown when a chart may be expensive to render.
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
import {
  FACET_LIMIT,
  MARKS_LIMIT,
  RenderCostValidation,
  SERIES_LIMIT,
} from '../../observable-plot-generator/faceting/renderCostValidation';

interface FacetLimitDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Validation result containing render-cost counts and field information */
  validationResult: RenderCostValidation | null;
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

function buildDialogCopy(validationResult: RenderCostValidation) {
  const {
    rowFacetCount,
    colFacetCount,
    seriesCount,
    categoryCount,
    categoryLimit,
    estimatedMarks,
    exceedsLimit,
  } = validationResult;

  if (exceedsLimit === 'series') {
    return {
      title: 'Too Many Series',
      message: `This chart would render ${formatNumber(seriesCount)} series, which exceeds the recommended limit of ${formatNumber(SERIES_LIMIT)}.`,
      impact: 'Rendering this many lines or paths may cause your browser to become slow or unresponsive.',
      suggestionsTitle: 'Suggestions to reduce series:',
      suggestions: [
        'Apply filters to reduce the number of unique color values',
        'Remove or change the color field',
        'Choose a chart type that summarizes categories differently',
      ],
    };
  }

  if (exceedsLimit === 'category') {
    return {
      title: 'Too Many Categories',
      message: `This chart would render ${formatNumber(categoryCount)} categories, which exceeds the recommended limit of ${formatNumber(categoryLimit)}.`,
      impact: 'Rendering this many bars or category marks may cause your browser to become slow or unresponsive.',
      suggestionsTitle: 'Suggestions to reduce categories:',
      suggestions: [
        'Apply filters to reduce the number of unique category values',
        'Remove or change the discrete category field',
        'Use a higher-level categorical field if one is available',
      ],
    };
  }

  if (exceedsLimit === 'marks') {
    return {
      title: 'Too Many Marks',
      message: `This chart would render about ${formatNumber(estimatedMarks)} mark groups, which exceeds the recommended limit of ${formatNumber(MARKS_LIMIT)}.`,
      impact: 'Rendering this many chart marks may cause your browser to become slow or unresponsive.',
      suggestionsTitle: 'Suggestions to reduce render cost:',
      suggestions: [
        'Apply filters to reduce facets, series, or categories',
        'Remove discrete dimensions from axes or color',
        'Choose a less granular chart configuration',
      ],
    };
  }

  let message = '';
  if (exceedsLimit === 'both') {
    message = `Both row facets (${formatNumber(rowFacetCount)}) and column facets (${formatNumber(colFacetCount)}) exceed the recommended limit of ${formatNumber(FACET_LIMIT)}.`;
  } else if (exceedsLimit === 'row') {
    message = `Row facets (${formatNumber(rowFacetCount)}) exceed the recommended limit of ${formatNumber(FACET_LIMIT)}.`;
  } else if (exceedsLimit === 'col') {
    message = `Column facets (${formatNumber(colFacetCount)}) exceed the recommended limit of ${formatNumber(FACET_LIMIT)}.`;
  }

  return {
    title: 'Large Number of Facets',
    message,
    impact: 'Rendering this many charts may cause your browser to become slow or unresponsive.',
    suggestionsTitle: 'Suggestions to reduce facets:',
    suggestions: [
      'Apply filters to reduce the number of unique values',
      'Move some discrete dimensions to other encodings (color, size)',
      'Remove discrete dimensions from the axes',
    ],
  };
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
    seriesCount,
    categoryCount,
    estimatedMarks,
  } = validationResult;

  const totalFacets = rowFacetCount * colFacetCount;
  const rowFieldsDesc = buildFieldDescription(rowFacetFields);
  const colFieldsDesc = buildFieldDescription(colFacetFields);
  const copy = buildDialogCopy(validationResult);

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
        {copy.title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="facet-limit-dialog-description" component="div">
          <Alert severity="warning" sx={{ mb: 2 }}>
            {copy.message}
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
            {seriesCount > 1 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                • <strong>{formatNumber(seriesCount)}</strong> series
              </Typography>
            )}
            {categoryCount > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                • <strong>{formatNumber(categoryCount)}</strong> categories
              </Typography>
            )}
            {estimatedMarks > 1 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                • <strong>{formatNumber(estimatedMarks)}</strong> estimated mark groups
              </Typography>
            )}
          </Box>

          <Typography variant="body2" color="text.secondary" paragraph>
            {copy.impact}
          </Typography>

          <Typography variant="body2" fontWeight="medium">
            {copy.suggestionsTitle}
          </Typography>
          <Box component="ul" sx={{ mt: 0.5, pl: 3, color: 'text.secondary' }}>
            {copy.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <Typography variant="body2">{suggestion}</Typography>
              </li>
            ))}
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
