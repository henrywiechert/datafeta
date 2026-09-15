// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles';
import denseTheme from './index';

/**
 * The app's single theme provider.
 *
 * Exists as its own component so that the `experimental_*` MUI identifiers
 * appear in exactly one place. In MUI v6/v7 this API becomes
 * `createTheme({ cssVariables: true, colorSchemes: {...} })` with the plain
 * `ThemeProvider`, and the generated variable names are unchanged — so that
 * migration is a rename inside this file and `index.ts`, not an app-wide sweep.
 *
 * `attribute` is deliberately the app's own name rather than MUI's default
 * `data-mui-color-scheme`: the hand-authored `--df-*` token layer keys its dark
 * block on the same attribute, so one flip switches both layers atomically —
 * and ag-grid too, once its theme params reference the same variables.
 *
 * Storage keys follow the cleanest existing convention in the app
 * (`dataslicer.tablePageSize`) rather than MUI's `mui-mode`, which would leak
 * vendor naming into user storage.
 *
 * `defaultMode` stays `'light'` until the dark scheme's values actually exist.
 * `'system'` here would hand a half-built dark UI to every OS-dark user.
 */
const ThemeRoot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <CssVarsProvider
    theme={denseTheme}
    attribute="data-df-color-scheme"
    modeStorageKey="dataslicer.themeMode"
    colorSchemeStorageKey="dataslicer.themeScheme"
    defaultMode="light"
    disableTransitionOnChange
  >
    {children}
  </CssVarsProvider>
);

export default ThemeRoot;
