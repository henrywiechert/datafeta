// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Typed view of the token definitions.
 *
 * `tokens.def.json` is the single source of truth, kept as JSON so that
 * `scripts/generate-tokens.js` can read it without a TypeScript parser.
 * Import `T` from `./tokens` for styling; import `TOKENS` from here only when
 * a concrete value is required (luminance math, Observable Plot opacities —
 * see THEMING.md).
 *
 * A scheme in the JSON is either a full table of values (`light`, `dark`) or a
 * *patch* over another scheme (`{ extends, values }` — `dim`). The resolution
 * below is the second implementation of that merge; the generator owns the
 * first, and `tokens.test.ts` asserts the generated CSS matches what this
 * module resolves. Same arrangement as the camelCase → kebab-case transform,
 * and for the same reason: a build script cannot import TypeScript.
 */
import definitions from './tokens.def.json';

/** The base scheme. Fully specified, and the one that lands in `:root`. */
type BaseScheme = typeof definitions.light;

export type DfTokenName = keyof BaseScheme;

export type ColorScheme = keyof typeof definitions;

type SchemePatch = { extends: ColorScheme; values: Partial<Record<DfTokenName, string>> };

const isPatch = (def: unknown): def is SchemePatch =>
  def !== null && typeof def === 'object' && 'extends' in def;

const resolve = (scheme: ColorScheme): Record<DfTokenName, string> => {
  const def: unknown = definitions[scheme];
  return isPatch(def)
    ? { ...resolve(def.extends), ...def.values }
    : (def as BaseScheme);
};

export const COLOR_SCHEMES = Object.keys(definitions) as ColorScheme[];

/**
 * For each scheme defined as a patch, the scheme it patches. Exported so tests
 * can assert a variant actually varies from its base rather than restating it.
 */
export const SCHEME_BASES = COLOR_SCHEMES.reduce((bases, scheme) => {
  const def: unknown = definitions[scheme];
  if (isPatch(def)) bases[scheme] = def.extends;
  return bases;
}, {} as Partial<Record<ColorScheme, ColorScheme>>);

export const TOKENS = COLOR_SCHEMES.reduce((all, scheme) => {
  all[scheme] = resolve(scheme);
  return all;
}, {} as Record<ColorScheme, Record<DfTokenName, string>>);

export const DF_TOKEN_NAMES = Object.keys(definitions.light) as DfTokenName[];
