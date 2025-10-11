import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import styles from './PropertyDropZone.module.css';

export interface PropertyDropZoneProps {
  /** Whether the drop zone has content */
  hasContent: boolean;
  
  /** Message to display when empty */
  emptyMessage: string;
  
  /** Content to display when filled */
  children?: React.ReactNode;
  
  /** Drag over handler */
  onDragOver?: (e: React.DragEvent) => void;
  
  /** Drag leave handler */
  onDragLeave?: (e: React.DragEvent) => void;
  
  /** Drop handler */
  onDrop?: (e: React.DragEvent) => void;
}

export const PropertyDropZone: React.FC<PropertyDropZoneProps> = ({
  hasContent,
  emptyMessage,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
    onDragOver?.(e);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    onDragLeave?.(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    onDrop?.(e);
  };

  return (
    <Box
      className={`${styles.dropZone} ${hasContent ? styles.hasContent : ''} ${
        isOver ? styles.dragOver : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {hasContent ? (
        <Box className={styles.content}>{children}</Box>
      ) : (
        <Typography className={styles.emptyMessage}>
          {emptyMessage}
        </Typography>
      )}
    </Box>
  );
};
