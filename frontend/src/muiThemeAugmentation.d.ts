// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Teaches TypeScript that `theme` carries `vars` (the CSS-variable palette)
 * now that the app builds its theme with `experimental_extendTheme`.
 * Without this, `theme.vars` is a type error in any `sx` callback.
 */
import '@mui/material/themeCssVarsAugmentation';
