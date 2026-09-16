// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Teaches TypeScript that `theme` carries `vars` (the CSS-variable palette)
 * now that the app builds its theme with `experimental_extendTheme`.
 * Without this, `theme.vars` is a type error in any `sx` callback.
 */
import '@mui/material/themeCssVarsAugmentation';

/**
 * Registers the app's extra colour schemes, so `SupportedColorScheme` covers
 * them and `theme.colorSchemes.dim` is not a type error.
 *
 * Must list the same schemes as `theme/tokens.def.json` minus `light`/`dark`,
 * which TypeScript cannot check from a `.d.ts` — `theme/tokens.test.ts`
 * asserts the two agree instead.
 */
declare module '@mui/material/styles' {
  interface ColorSchemeOverrides {
    dim: true;
    solarized: true;
  }
}
