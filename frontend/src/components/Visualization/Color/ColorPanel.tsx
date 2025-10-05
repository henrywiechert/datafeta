import React from 'react';
import { Box, Typography } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import { Field, DragSource } from '../../../types';
import ColorDropZone from './ColorDropZone';
import styles from './ColorPanel.module.css';

interface ColorPanelProps {
  colorField: Field | null;
  onDrop: (field: Field, source: DragSource) => void;
  onRemove: () => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  colorField,
  onDrop,
  onRemove,
}) => {
  return (
    <Box className={styles.container}>
      {/* Header */}
      <Box className={styles.header}>
        <Box className={styles.titleContainer}>
          <PaletteIcon fontSize="small" />
          <Typography variant="h6" className={styles.title}>
            Color
          </Typography>
        </Box>
      </Box>

      {/* Drop Zone */}
      <Box className={styles.content}>
        <ColorDropZone
          colorField={colorField}
          onDrop={onDrop}
          onRemove={onRemove}
        />
      </Box>
    </Box>
  );
};

export default ColorPanel;

