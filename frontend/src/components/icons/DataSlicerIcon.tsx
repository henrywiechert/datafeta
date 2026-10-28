// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

/** The datafeta brand mark; same artwork as public/datafeta-icons/datafeta-icon.svg. */
const DataSlicerIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon viewBox="0 0 512 512" {...props}>
    <rect width="512" height="512" rx="112" fill="#F6EEDB" />
    <g transform="translate(256 258) scale(1.15) translate(-256 -258) translate(25 0)">
      <circle cx="224" cy="296" r="88" fill="none" stroke="#12343B" strokeWidth="56" />
      <circle
        cx="224"
        cy="296"
        r="88"
        fill="none"
        stroke="#F2A541"
        strokeWidth="56"
        strokeDasharray="138.2 414.7"
        transform="rotate(90 224 296)"
      />
      <rect x="298" y="104" width="56" height="308" rx="28" fill="#12343B" />
      <circle cx="224" cy="296" r="28" fill="#F2A541" />
    </g>
  </SvgIcon>
);

export default DataSlicerIcon;
