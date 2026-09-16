// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import styles from './SectionHeader.module.css';

/**
 * The header row of a collapsible card, and the one place the collapse
 * affordance is defined.
 *
 * Every card in the Properties well and the Fields well uses this, so the
 * chevron sits on the left and rotates in all of them. The Fields well used to
 * do it differently — chevron on the far right, swapping between ExpandLess and
 * ExpandMore with no transition — which read as a different control for the
 * same job.
 *
 * The row is the click target. Anything interactive passed as `actions` gets a
 * `stopPropagation` wrapper so it does not toggle the card as a side effect.
 */
export interface SectionHeaderProps {
  /** Section title, e.g. "Filters" or "Data Source". */
  title: string;

  /** Optional glyph between the chevron and the title. */
  icon?: React.ReactNode;

  /**
   * Summary shown beside the title while collapsed — the Data Source card uses
   * it for the selected table, so a collapsed card still says what it holds.
   */
  hint?: React.ReactNode;

  expanded: boolean;
  onToggle: () => void;

  /** When false the row renders flat, with no chevron and no hover. */
  collapsible?: boolean;

  /** Buttons rendered at the right end of the row. */
  actions?: React.ReactNode;

  /** `id` of the element this header expands, for `aria-controls`. */
  controls?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
  hint,
  expanded,
  onToggle,
  collapsible = true,
  actions,
  controls,
}) => {
  const handleToggle = () => {
    if (collapsible) {
      onToggle();
    }
  };

  return (
    <Box
      className={`${styles.header} ${collapsible ? styles.clickable : ''}`}
      onClick={handleToggle}
    >
      <Box className={styles.titleContainer}>
        {collapsible && (
          <IconButton
            size="small"
            className={styles.expandIcon}
            aria-expanded={expanded}
            aria-controls={controls}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title.toLowerCase()}`}
            sx={{
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease-in-out',
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        )}
        {icon && <Box className={styles.icon}>{icon}</Box>}
        <Typography variant="subtitle2" className={styles.title}>
          {title}
        </Typography>
        {!expanded && hint && (
          <Typography component="span" variant="caption" className={styles.hint}>
            {hint}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box className={styles.actions} onClick={(e) => e.stopPropagation()}>
          {actions}
        </Box>
      )}
    </Box>
  );
};

export default SectionHeader;
