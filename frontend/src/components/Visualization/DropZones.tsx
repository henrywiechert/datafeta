import React from 'react';
import {
  Paper,
  Typography,
  Stack
} from '@mui/material';
import styles from './DropZones.module.css';

function DropZones() {
  return (
    <Stack spacing={2} className={styles.dropZoneStack}>
      <Paper
        variant="outlined"
        className={styles.dropZonePaper}
      >
        <Typography variant="body1" color="text.secondary">X-Axis Drop Zone</Typography>
      </Paper>
      <Paper
        variant="outlined"
        className={styles.dropZonePaper}
      >
        <Typography variant="body1" color="text.secondary">Y-Axis Drop Zone</Typography>
      </Paper>
    </Stack>
  );
}

export default DropZones; 