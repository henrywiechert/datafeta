// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useState, useEffect } from 'react';
import { Box, Collapse } from '@mui/material';
import SectionHeader from './SectionHeader';
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
      <SectionHeader
        title={title}
        icon={icon}
        expanded={expanded}
        onToggle={handleToggle}
        collapsible={collapsible}
        actions={headerActions}
      />
      <Collapse in={expanded} timeout={200}>
        <Box className={styles.content}>{children}</Box>
      </Collapse>
    </Box>
  );
};
