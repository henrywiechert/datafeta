import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

const DataSlicerIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon viewBox="-0.5 -0.5 207 207" {...props}>
    <ellipse cx="103" cy="103" rx="100" ry="100" fill="#f5f5f5" stroke="#666666" strokeWidth="7" />
    <rect x="43" y="43" width="80" height="80" fill="#7ea6e0" stroke="#6c8ebf" strokeWidth="6" />
    <rect x="83" y="83" width="80" height="80" fill="#ea6b66" stroke="#b85450" strokeWidth="6" />
  </SvgIcon>
);

export default DataSlicerIcon;
