// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Alert } from '@mui/material';
import { useVisualizationContext } from '../../../../contexts/VisualizationContext';
import { shouldWarnGeoScatter } from '../../../../utils/mapUtils';

const GeoScatterWarning: React.FC = () => {
  const { state } = useVisualizationContext();
  const { xAxisFields, yAxisFields, globalChartType } = state;

  if (!shouldWarnGeoScatter(globalChartType, xAxisFields, yAxisFields)) {
    return null;
  }

  return (
    <Alert severity="info" sx={{ mx: 1, mb: 0.5, py: 0.25 }}>
      Longitude and latitude on both axes render as a Cartesian scatter, which can be misleading. Try the Map chart type.
    </Alert>
  );
};

export default GeoScatterWarning;
