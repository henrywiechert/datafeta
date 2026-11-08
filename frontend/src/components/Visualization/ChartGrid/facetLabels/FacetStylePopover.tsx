// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Popover } from '@mui/material';
import {
  FacetLabelAlign,
  FacetWrapMode,
} from '../../../../contexts/VisualizationContext/types';
import { useFullscreenPortalTarget } from '../../../../hooks/useFullscreenPortalTarget';
import {
  FontSizeRow,
  LABEL_POPOVER_PAPER_PROPS,
  LabelPopoverBody,
  LabelPopoverTitle,
  ToggleRow,
  useFrozenAnchorPosition,
} from '../labelPopoverControls';

const ALIGN_OPTIONS = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
];

const WRAP_OPTIONS = [
  { value: 'wrap', label: 'Wrap' },
  { value: 'nowrap', label: 'No Wrap' },
];

export interface FacetStylePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  title: string;
  scopeLabel?: string;
  fontSize: number;
  orientation: string;
  horizontalAlign?: FacetLabelAlign;
  verticalAlign?: FacetLabelAlign;
  wrapMode?: FacetWrapMode;
  onFontSizeChange: (fontSize: number) => void;
  onOrientationChange: (orientation: string) => void;
  onHorizontalAlignChange?: (alignment: FacetLabelAlign) => void;
  onVerticalAlignChange?: (alignment: FacetLabelAlign) => void;
  onWrapModeChange?: (wrapMode: FacetWrapMode) => void;
  /** When set, shows a button that returns the label size to auto-fit. */
  onResetSize?: () => void;
  orientationOptions: string[];
}

const FacetStylePopover: React.FC<FacetStylePopoverProps> = ({
  anchorEl,
  onClose,
  title,
  scopeLabel,
  fontSize,
  orientation,
  horizontalAlign,
  verticalAlign,
  wrapMode,
  onFontSizeChange,
  onOrientationChange,
  onHorizontalAlignChange,
  onVerticalAlignChange,
  onWrapModeChange,
  onResetSize,
  orientationOptions,
}) => {
  const open = Boolean(anchorEl);
  // In fullscreen mode the browser only paints the fullscreen element's subtree,
  // so MUI's default portal to document.body renders behind the fullscreen layer.
  // Render into the fullscreen element instead (falls back to document.body).
  const portalTarget = useFullscreenPortalTarget();
  const anchorPosition = useFrozenAnchorPosition(anchorEl);

  return (
    <Popover
      open={open}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      onClose={onClose}
      container={portalTarget}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      PaperProps={LABEL_POPOVER_PAPER_PROPS}
    >
      <LabelPopoverBody>
        <LabelPopoverTitle title={title} scopeLabel={scopeLabel} onResetSize={onResetSize} />

        <FontSizeRow value={fontSize} min={8} max={26} onChange={onFontSizeChange} />

        <ToggleRow
          label="Orientation"
          value={orientation}
          options={orientationOptions.map((opt) => ({ value: opt, label: opt }))}
          onChange={onOrientationChange}
          capitalize
        />

        {onHorizontalAlignChange && horizontalAlign && (
          <ToggleRow
            label="Horizontal Align"
            value={horizontalAlign}
            options={ALIGN_OPTIONS}
            onChange={(val) => onHorizontalAlignChange(val as FacetLabelAlign)}
          />
        )}

        {onVerticalAlignChange && verticalAlign && (
          <ToggleRow
            label="Vertical Align"
            value={verticalAlign}
            options={ALIGN_OPTIONS}
            onChange={(val) => onVerticalAlignChange(val as FacetLabelAlign)}
          />
        )}

        {onWrapModeChange && wrapMode && (
          <ToggleRow
            label="Wrap Mode"
            value={wrapMode}
            options={WRAP_OPTIONS}
            onChange={(val) => onWrapModeChange(val as FacetWrapMode)}
          />
        )}
      </LabelPopoverBody>
    </Popover>
  );
};

export default FacetStylePopover;
