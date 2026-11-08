// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Popover } from '@mui/material';
import { XAxisLabelStyle, YAxisLabelStyle } from '../../../contexts/VisualizationContext/types';
import { useFullscreenPortalTarget } from '../../../hooks/useFullscreenPortalTarget';
import {
  FontSizeRow,
  LABEL_POPOVER_PAPER_PROPS,
  LabelPopoverBody,
  LabelPopoverTitle,
  ToggleRow,
  useFrozenAnchorPosition,
} from './labelPopoverControls';

// Base props shared by both axis types
interface BaseAxisLabelStylePopoverProps {
  /** Anchor element for the popover */
  anchorEl: HTMLElement | null;
  /** Close handler */
  onClose: () => void;
}

// X-axis specific props
interface XAxisLabelStylePopoverProps extends BaseAxisLabelStylePopoverProps {
  axis: 'x';
  style: XAxisLabelStyle;
  onChange: (updates: Partial<XAxisLabelStyle>) => void;
}

// Y-axis specific props
interface YAxisLabelStylePopoverProps extends BaseAxisLabelStylePopoverProps {
  axis: 'y';
  style: YAxisLabelStyle;
  onChange: (updates: Partial<YAxisLabelStyle>) => void;
}

type AxisLabelStylePopoverProps = XAxisLabelStylePopoverProps | YAxisLabelStylePopoverProps;

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 26;

const X_ORIENTATIONS: { value: XAxisLabelStyle['orientation']; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'angled', label: 'Angled' },
];

const Y_ORIENTATIONS: { value: YAxisLabelStyle['orientation']; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

/**
 * AxisLabelStylePopover - Popover menu for configuring axis label styles
 * 
 * Provides controls for:
 * - Font size (8-26px slider)
 * - Orientation (horizontal/vertical/angled)
 *
 * Label row/column sizes are set by dragging the handle in the chart (the Reset size button
 * returns to auto-fit); changing the orientation also resets to auto-fit.
 */
const AxisLabelStylePopover: React.FC<AxisLabelStylePopoverProps> = (props) => {
  const { anchorEl, onClose, axis, style, onChange } = props;
  const open = Boolean(anchorEl);
  // Portal into the fullscreen element so the popover is painted above the
  // fullscreen layer instead of behind it (defaults to document.body otherwise).
  const portalTarget = useFullscreenPortalTarget();
  const anchorPosition = useFrozenAnchorPosition(anchorEl);

  // Orientation changes the text footprint, so a manual size falls back to
  // auto-fit; font size changes leave the user's size untouched.
  const sizeResetUpdate = axis === 'x' ? { heightPx: null } : { widthPx: null };

  const handleFontSizeChange = (fontSize: number) => {
    (onChange as (updates: { fontSize: number }) => void)({ fontSize });
  };

  const handleOrientationChange = (orientation: string) => {
    (onChange as (updates: Record<string, unknown>) => void)({ orientation, ...sizeResetUpdate });
  };

  const handleCategoryOrientationChange = (categoryOrientation: string) => {
    (onChange as (updates: { categoryOrientation: string }) => void)({ categoryOrientation });
  };

  const handleResetSize = () => {
    (onChange as (updates: Record<string, unknown>) => void)(sizeResetUpdate);
  };

  const orientations = axis === 'x' ? X_ORIENTATIONS : Y_ORIENTATIONS;

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
        <LabelPopoverTitle
          title={`${axis === 'x' ? 'X-Axis' : 'Y-Axis'} Label Style`}
          onResetSize={handleResetSize}
        />

        <FontSizeRow
          value={style.fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          onChange={handleFontSizeChange}
        />

        <ToggleRow
          label={axis === 'x' ? 'Label orientation' : 'Orientation'}
          value={style.orientation}
          options={orientations}
          onChange={handleOrientationChange}
        />

        {/* Category (tick label) orientation: X-axis only */}
        {axis === 'x' && (
          <ToggleRow
            label="Category orientation"
            value={(style as XAxisLabelStyle).categoryOrientation ?? 'vertical'}
            options={X_ORIENTATIONS}
            onChange={handleCategoryOrientationChange}
          />
        )}
      </LabelPopoverBody>
    </Popover>
  );
};

export default React.memo(AxisLabelStylePopover);
