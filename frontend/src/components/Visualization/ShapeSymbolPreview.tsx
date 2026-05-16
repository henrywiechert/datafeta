// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
import {
  MANUAL_NO_SHAPE,
  ManualShapeOption,
  ShapeSymbolName,
} from '../../observable-plot-generator/utils/shapeUtils';

type PreviewSymbol = ShapeSymbolName | ManualShapeOption;

interface ShapeSymbolPreviewProps {
  symbol: PreviewSymbol;
  fontSize?: SvgIconProps['fontSize'];
}

const ShapeSymbolPreview: React.FC<ShapeSymbolPreviewProps> = ({
  symbol,
  fontSize = 'small',
}) => {
  switch (symbol) {
    case MANUAL_NO_SHAPE:
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.25" fill="currentColor" stroke="none" />
        </SvgIcon>
      );
    case 'circle':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'square':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <rect x="7" y="7" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'diamond':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M12 5 L19 12 L12 19 L5 12 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'triangle':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M12 5 L19 18 L5 18 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
      );
    case 'star':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M12 4.5 L14.2 9.1 L19.3 9.8 L15.6 13.4 L16.5 18.5 L12 16.1 L7.5 18.5 L8.4 13.4 L4.7 9.8 L9.8 9.1 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </SvgIcon>
      );
    case 'cross':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M10 5 H14 V10 H19 V14 H14 V19 H10 V14 H5 V10 H10 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" />
        </SvgIcon>
      );
    case 'wye':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M11 12.5 L6.7 8.2 L8.2 6.7 L12 10.5 L15.8 6.7 L17.3 8.2 L13 12.5 V18 H11 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </SvgIcon>
      );
    case 'asterisk':
      return (
        <SvgIcon fontSize={fontSize} viewBox="0 0 24 24">
          <path d="M11 4 H13 V10.1 L18.3 7.1 L19.3 8.9 L14 12 L19.3 15.1 L18.3 16.9 L13 13.9 V20 H11 V13.9 L5.7 16.9 L4.7 15.1 L10 12 L4.7 8.9 L5.7 7.1 L11 10.1 Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </SvgIcon>
      );
    default:
      return null;
  }
};

export default ShapeSymbolPreview;