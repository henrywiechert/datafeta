// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

// Two tables linked by a curved connector.
const RelationshipIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="3" width="8" height="6" rx="1.5" />
      <rect x="14" y="15" width="8" height="6" rx="1.5" />
      <path d="M10 6 C14 6 10 18 14 18" />
    </g>
  </SvgIcon>
);

export default RelationshipIcon;
