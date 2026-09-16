// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAutoOutlined';

type Mode = 'light' | 'dark' | 'system';

/** Cycles system → light → dark → system, so every state is reachable from one button. */
const NEXT: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' };

const ICON: Record<Mode, React.ReactElement> = {
  system: <BrightnessAutoIcon fontSize="small" />,
  light: <LightModeIcon fontSize="small" />,
  dark: <DarkModeIcon fontSize="small" />,
};

const LABEL: Record<Mode, string> = {
  system: 'Theme: follow system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

/**
 * Light/dark/system switch.
 *
 * State lives in MUI's `useColorScheme`, which already owns reading the stored
 * preference before first render, writing it back, subscribing to the OS
 * setting, and syncing across tabs — so this is a button, not a state machine.
 * Flipping it sets `data-df-color-scheme` on `<html>`, which switches the
 * `--mui-palette-*` layer, the `--df-*` layer and the ag-grid theme at once.
 */
const ThemeModeToggle: React.FC = () => {
  const { mode, setMode } = useColorScheme();
  const current = (mode ?? 'system') as Mode;

  const handleClick = useCallback(() => {
    setMode(NEXT[current]);
  }, [current, setMode]);

  return (
    <Tooltip title={LABEL[current]}>
      <IconButton size="small" onClick={handleClick} aria-label={LABEL[current]} sx={{ color: 'text.secondary' }}>
        {ICON[current]}
      </IconButton>
    </Tooltip>
  );
};

export default ThemeModeToggle;
