// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
import { getLineStyleDashArray, LineStyleName } from '../../observable-plot-generator/utils/lineStyleUtils';

interface LineStylePreviewProps {
  style: LineStyleName;
  fontSize?: SvgIconProps['fontSize'];
}

/** A short horizontal line drawn with the chart's dash pattern for `style`. */
const LineStylePreview: React.FC<LineStylePreviewProps> = ({ style, fontSize = 'small' }) => (
  <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
    <line
      x1="2"
      y1="12"
      x2="22"
      y2="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray={getLineStyleDashArray(style)}
    />
  </SvgIcon>
);

export default LineStylePreview;
