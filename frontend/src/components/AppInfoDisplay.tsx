import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Typography,
} from '@mui/material';
import DataSlicerIcon from './icons/DataSlicerIcon';

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

const AppInfoDisplay: React.FC = () => {
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({
    frontend: null,
    backend: null
  });
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{
          textTransform: 'none',
          minWidth: 88,
          height: 28,
        }}
      >
        App Info
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DataSlicerIcon sx={{ fontSize: '1.6rem' }} />
            <Box component="span" sx={{ fontWeight: 700 }}>DataSlicer</Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                App Description
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Data Slicer started in summer 2025 as a not-so-serious vibe-coding fun project and is 
                implemented with 99.9% AI generated code.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                This single page app (SPA) provides in-browser OLAP experience, data slicing and dicing capabilities, with a focus on intuitive drag-and-drop interactions and a clean user interface.
                The app implements parts of the{' '}
                <Link
                  href="https://graphics.stanford.edu/papers/polaris/polaris.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Polaris Formalism
                </Link>
                , first described in year 2000 at Stanford University. The authors later founded{' '}
                <Link
                  href="https://www.tableau.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Tableau Software™
                </Link>
                {' '}, today owned by SalesForce™.
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Version Information
              </Typography>

              <Box sx={{ mb: 1.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Frontend
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Version: {versionInfo.frontend?.version || 'Unavailable'}
                </Typography>
                {versionInfo.frontend?.gitHash && (
                  <Typography variant="body2" color="text.secondary">
                    Hash: {versionInfo.frontend.gitHash}
                  </Typography>
                )}
                {versionInfo.frontend?.buildDate && (
                  <Typography variant="body2" color="text.secondary">
                    Built: {new Date(versionInfo.frontend.buildDate).toLocaleString()}
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Backend
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Version: {versionInfo.backend?.version || 'Unavailable'}
                </Typography>
                {versionInfo.backend?.gitHash && (
                  <Typography variant="body2" color="text.secondary">
                    Hash: {versionInfo.backend.gitHash}
                  </Typography>
                )}
                {versionInfo.backend?.buildDate && (
                  <Typography variant="body2" color="text.secondary">
                    Built: {new Date(versionInfo.backend.buildDate).toLocaleString()}
                  </Typography>
                )}
              </Box>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Author
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Henry Wiechert
              </Typography>
              <Typography variant="body2" color="text.secondary">
                henry.wiechert@gmx.de
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AppInfoDisplay;
