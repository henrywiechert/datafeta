// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useState } from 'react';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import NightsStayIcon from '@mui/icons-material/NightsStayOutlined';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAutoOutlined';

/**
 * What the user picks. Not the same axis as MUI's `mode`: two of these are the
 * *dark* mode with different colour schemes behind it, which is exactly the
 * split `setColorScheme({ dark })` exists for.
 */
type Choice = 'system' | 'light' | 'dark' | 'dim';

const CHOICES: Array<{ id: Choice; label: string; icon: React.ReactElement }> = [
  { id: 'system', label: 'Follow system', icon: <BrightnessAutoIcon fontSize="small" /> },
  { id: 'light', label: 'Light', icon: <LightModeIcon fontSize="small" /> },
  { id: 'dark', label: 'Dark', icon: <DarkModeIcon fontSize="small" /> },
  { id: 'dim', label: 'Dim', icon: <NightsStayIcon fontSize="small" /> },
];

/** Kept in the aria-label so the control is addressable by its current state. */
const ARIA: Record<Choice, string> = {
  system: 'Theme: follow system',
  light: 'Theme: light',
  dark: 'Theme: dark',
  dim: 'Theme: dim',
};

/**
 * Light / dark / dim / system switch.
 *
 * State lives in MUI's `useColorScheme`, which already owns reading the stored
 * preference before first render, writing it back, subscribing to the OS
 * setting, and syncing across tabs — so this is a menu, not a state machine.
 * Picking an entry sets `data-df-color-scheme` on `<html>`, which switches the
 * `--mui-palette-*` layer, the `--df-*` layer and the ag-grid theme at once.
 *
 * Two entries resolve to MUI's dark *mode* and differ only in which colour
 * scheme that mode uses, so they set both: `setMode('dark')` and
 * `setColorScheme({ dark })`. A consequence worth knowing: the dark variant is
 * remembered independently of the mode, so picking Dim and later Follow system
 * means a system that reports dark gets dim.
 *
 * It was a 3-state cycling button while there was only one dark scheme. Four
 * states is where cycling stops being a shortcut — reaching Light from Dim
 * would take three clicks — and a menu can show the names.
 */
const ThemeModeToggle: React.FC = () => {
  const { mode, colorScheme, setMode, setColorScheme } = useColorScheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // `system` stays `system` even when it resolves to a dark scheme: it is what
  // the user picked, and the menu shows the choice rather than the outcome.
  const current: Choice = mode === 'light'
    ? 'light'
    : mode === 'dark'
      ? (colorScheme === 'dim' ? 'dim' : 'dark')
      : 'system';

  const choose = useCallback((id: Choice) => {
    if (id === 'dark' || id === 'dim') {
      setColorScheme({ dark: id });
      setMode('dark');
    } else {
      setMode(id);
    }
    setAnchorEl(null);
  }, [setMode, setColorScheme]);

  return (
    <>
      <Tooltip title={ARIA[current]}>
        <IconButton
          size="small"
          onClick={(event) => setAnchorEl(event.currentTarget)}
          aria-label={ARIA[current]}
          aria-haspopup="true"
          sx={{ color: 'text.secondary' }}
        >
          {CHOICES.find((choice) => choice.id === current)!.icon}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={() => setAnchorEl(null)}>
        {CHOICES.map(({ id, label, icon }) => (
          <MenuItem key={id} selected={id === current} onClick={() => choose(id)}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default ThemeModeToggle;
