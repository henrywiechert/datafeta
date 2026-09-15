// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Typed view of the token definitions.
 *
 * `tokens.def.json` is the single source of truth, kept as JSON so that
 * `scripts/generate-tokens.js` can read it without a TypeScript parser.
 * Import `T` from `./tokens` for styling; import `TOKENS` from here only when
 * a concrete value is required (luminance math, Observable Plot opacities —
 * see THEMING.md).
 */
import definitions from './tokens.def.json';

export type ColorScheme = 'light' | 'dark';

export type DfTokenName = keyof typeof definitions.light;

export const TOKENS: Record<ColorScheme, Record<DfTokenName, string>> = definitions;

export const DF_TOKEN_NAMES = Object.keys(definitions.light) as DfTokenName[];
