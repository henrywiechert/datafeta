import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import styles from './PropertySection.module.css';

export interface PropertySectionProps {
  /** Section title (e.g., "Filters", "Color") */
  title: string;
  
  /** Icon to display next to title */
  icon: React.ReactNode;
  
  /** Whether section is expanded by default */
  defaultExpanded?: boolean;
  
  /** Whether section can be collapsed */
  collapsible?: boolean;
  
  /** Optional actions to display in header (buttons, etc.) */
  headerActions?: React.ReactNode;
  
  /** Content to display in section */
  children: React.ReactNode;
  
  /** LocalStorage key for persisting collapsed state */
  storageKey?: string;
}

export const PropertySection: React.FC<PropertySectionProps> = ({
  title,
  icon,
  defaultExpanded = true,
  collapsible = true,
  headerActions,
  children,
  storageKey,
}) => {
  // Load collapsed state from localStorage if storageKey provided
  const getInitialExpanded = () => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return defaultExpanded;
  };

  const [expanded, setExpanded] = useState(getInitialExpanded);

  // Persist collapsed state to localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, String(expanded));
    }
  }, [expanded, storageKey]);

  const handleToggle = () => {
    if (collapsible) {
      setExpanded(!expanded);
    }
  };

  return (
    <Box className={styles.section}>
      <Box
        className={styles.header}
        onClick={handleToggle}
        sx={{ cursor: collapsible ? 'pointer' : 'default' }}
      >
        <Box className={styles.titleContainer}>
          {collapsible && (
            <IconButton
              size="small"
              className={styles.expandIcon}
              sx={{
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s ease-in-out',
              }}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          )}
          <Box className={styles.icon}>{icon}</Box>
          <Typography variant="subtitle2" className={styles.title}>
            {title}
          </Typography>
        </Box>
        {headerActions && (
          <Box
            className={styles.actions}
            onClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </Box>
        )}
      </Box>
      <Collapse in={expanded} timeout={200}>
        <Box className={styles.content}>{children}</Box>
      </Collapse>
    </Box>
  );
};
