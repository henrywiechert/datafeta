// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';

interface VersionInfo {
  frontend: {
    version: string;
    gitHash: string | null;
    gitTag: string | null;
    buildDate: string;
  } | null;
  backend: {
    version: string;
    gitHash: string | null;
    gitTag: string | null;
    buildDate: string;
  } | null;
}

const VersionDisplay: React.FC = () => {
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({
    frontend: null,
    backend: null
  });

  useEffect(() => {
    // Fetch frontend version
    fetch('/version.json')
      .then(res => res.json())
      .then(data => setVersionInfo(prev => ({ ...prev, frontend: data })))
      .catch(err => console.warn('Failed to load frontend version:', err));

    // Fetch backend version
    fetch('/api/version')
      .then(res => res.json())
      .then(data => setVersionInfo(prev => ({ ...prev, backend: data })))
      .catch(err => console.warn('Failed to load backend version:', err));
  }, []);

  const tooltipContent = (
    <Box sx={{ p: 0.5 }}>
      {versionInfo.frontend && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Frontend:</Typography>
          <Typography variant="caption" display="block">
            Version: {versionInfo.frontend.version}
          </Typography>
          {versionInfo.frontend.gitHash && (
            <Typography variant="caption" display="block">
              Hash: {versionInfo.frontend.gitHash}
            </Typography>
          )}
          <Typography variant="caption" display="block">
            Built: {new Date(versionInfo.frontend.buildDate).toLocaleString()}
          </Typography>
        </Box>
      )}
      {versionInfo.backend && (
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>Backend:</Typography>
          <Typography variant="caption" display="block">
            Version: {versionInfo.backend.version}
          </Typography>
          {versionInfo.backend.gitHash && (
            <Typography variant="caption" display="block">
              Hash: {versionInfo.backend.gitHash}
            </Typography>
          )}
          <Typography variant="caption" display="block">
            Built: {new Date(versionInfo.backend.buildDate).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );

  if (!versionInfo.frontend && !versionInfo.backend) {
    return null;
  }

  const displayVersion = versionInfo.frontend?.version || versionInfo.backend?.version || 'debug';

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontSize: '0.7rem',
          cursor: 'default',
          userSelect: 'none'
        }}
      >
        Version: {displayVersion}
      </Typography>
    </Tooltip>
  );
};

export default VersionDisplay;
