// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The app's semantic color tokens, as `var()` strings.
 *
 * This is the only place `var(--df-*)` strings are constructed, so a typo is a
 * compile error rather than a silent fallback — nothing in the toolchain
 * catches a bad custom-property name otherwise (the build stays green and the
 * declaration is simply dropped).
 *
 * Usage, by consumer:
 *   - CSS module       `background: var(--df-surface-panel)` (no import)
 *   - `sx` prop        keep MUI keys (`'text.secondary'`); use `T.*` only for
 *                      roles MUI has no name for
 *   - inline `style`   interpolate `T.*`
 *   - SVG attribute    interpolate `T.*` (Plot's isColor accepts var())
 *   - JS needing a real value  `TOKENS[scheme]` from './tokens.def'
 *
 * Which tokens delegate to MUI, and which are literals, is a deliberate split
 * documented in THEMING.md: a token may delegate to `var(--mui-palette-X)` only
 * when X actually *differs* between the light and dark schemes. MUI's `grey.*`
 * ramp and `common.*` are shared across both schemes, so a surface built on
 * `grey.50` would stay near-white in dark mode. Surfaces are therefore literals.
 */
import { DF_TOKEN_NAMES, DfTokenName } from './tokens.def';

/** camelCase token name -> kebab-case custom property name.
 *  Mirrored in scripts/generate-tokens.js; tokens.test.ts asserts they agree. */
export const cssVarName = (token: DfTokenName): string =>
  `--df-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** A `var()` reference to a token, usable anywhere CSS values are accepted. */
export const tokenVar = (token: DfTokenName): string => `var(${cssVarName(token)})`;

type TokenRefs = { readonly [K in DfTokenName]: string };

export const T: TokenRefs = DF_TOKEN_NAMES.reduce((refs, token) => {
  refs[token] = tokenVar(token);
  return refs;
}, {} as Record<DfTokenName, string>);

export type { DfTokenName };
