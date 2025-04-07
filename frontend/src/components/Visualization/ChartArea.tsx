import React from 'react';
import {
  Paper,
  Typography
} from '@mui/material';
import styles from './ChartArea.module.css';

function ChartArea() {
  return (
    <Paper variant="outlined" className={styles.chartArea}>
      <Typography variant="body1" color="text.secondary">Chart Area</Typography>
    </Paper>
  );
}

export default ChartArea; 