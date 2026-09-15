// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Locks the claim that moving from `createTheme` to `experimental_extendTheme`
 * changed no color.
 *
 * This matters because nothing else covers it: no test in the app wraps a theme
 * provider, `index.tsx` is not under test, and CSS never reaches jsdom (CRA maps
 * `*.module.css` to identity-obj-proxy and jsdom does not resolve `var()` at
 * all). So the 861-test suite would not notice a palette regression. These
 * assertions are the substitute.
 */
import { createTheme, experimental_extendTheme as extendTheme } from '@mui/material/styles';
import denseTheme from './index';

type Leaf = [path: string, value: unknown];

const leaves = (node: Record<string, any>, prefix = ''): Leaf[] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? leaves(value, path)
      : [[path, value] as Leaf];
  });

const at = (node: unknown, path: string): unknown =>
  path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), node);

const stockPalette = createTheme().palette;
const lightPalette = extendTheme().colorSchemes.light.palette;

/**
 * Every palette path the app actually references, with the `sx` occurrence
 * count at the time of the migration. Listed explicitly so that a future
 * palette edit has to look at what it is about to move.
 */
const REFERENCED_PATHS = [
  'text.secondary', 'action.hover', 'divider', 'primary.main', 'text.primary',
  'background.paper', 'action.selected', 'action.disabled', 'text.disabled',
  'grey.50', 'error.main', 'primary.dark', 'warning.main', 'success.main',
  'common.white', 'warning.light', 'warning.dark', 'secondary.main',
  'secondary.light', 'secondary.contrastText', 'primary.contrastText',
  'background.default', 'action.disabledBackground',
];

/**
 * Palette paths the app references that do NOT exist in MUI's default palette:
 * only `grey` ships a 50–900 ramp, so these resolve to `undefined` and apply no
 * style at all today. They are the active state of five toggles in
 * ChartControls.tsx (fullscreen, table rows, caption, independent X,
 * independent Y) and two backgrounds in SqlQueryViewerDialog.tsx.
 *
 * Defining these shades would make those highlights suddenly appear — a visual
 * change disguised as a no-op. Fixing them is a deliberate, separately
 * reviewable commit; until then this test keeps them dead on purpose.
 */
const INTENTIONALLY_UNDEFINED = ['primary.50', 'primary.100', 'info.50', 'success.50'];

describe('extendTheme light scheme is the stock MUI palette', () => {
  it('reproduces every leaf value createTheme defines', () => {
    const checked = leaves(stockPalette).filter(([, value]) => typeof value !== 'function');
    const differences = checked
      .filter(([path, value]) => at(lightPalette, path) !== value)
      .map(([path, value]) => `  ${path}: expected ${String(value)}, got ${String(at(lightPalette, path))}`);

    expect(differences.join('\n')).toBe('');
    // Guards against the filter silently matching nothing if MUI restructures.
    expect(checked.length).toBeGreaterThan(50);
  });

  it('only adds keys, never removes them', () => {
    const missing = Object.keys(stockPalette).filter((key) => !(key in lightPalette));
    expect(missing).toEqual([]);
  });

  it.each(REFERENCED_PATHS)('resolves %s identically to createTheme', (path) => {
    expect(at(lightPalette, path)).toBe(at(stockPalette, path));
    expect(at(lightPalette, path)).not.toBeUndefined();
  });

  it.each(INTENTIONALLY_UNDEFINED)('leaves %s undefined, as it is today', (path) => {
    expect(at(stockPalette, path)).toBeUndefined();
    expect(at(lightPalette, path)).toBeUndefined();
  });
});

describe('the app theme', () => {
  it('exposes the palette as CSS variables with literal fallbacks', () => {
    // The fallback is what prevents a flash before the provider's <style> lands.
    expect(denseTheme.vars.palette.primary.main).toBe('var(--mui-palette-primary-main, #1976d2)');
    expect(denseTheme.vars.palette.divider).toBe('var(--mui-palette-divider, rgba(0, 0, 0, 0.12))');
  });

  it('keeps the density overrides and shape that predate the migration', () => {
    expect(denseTheme.shape.borderRadius).toBe(4);
    expect(denseTheme.components?.MuiMenuItem?.defaultProps).toEqual({ dense: true });
    expect((denseTheme.components?.MuiDialogTitle?.styleOverrides?.root as any).fontSize).toBe('0.875rem');
  });

  it('defines no palette of its own, so app semantics stay in the --df-* layer', () => {
    expect(denseTheme.colorSchemes.light.palette.primary.main).toBe(stockPalette.primary.main);
  });

  it('ships a stock dark scheme, unreachable until ThemeRoot offers a toggle', () => {
    // ThemeRoot pins defaultMode="light" and nothing can change it yet, so
    // these values are inert. They become the starting point for P12.
    expect(denseTheme.colorSchemes.dark.palette.mode).toBe('dark');
    expect(denseTheme.colorSchemes.dark.palette.background.default).toBe('#121212');
    expect(denseTheme.colorSchemes.light.palette.mode).toBe('light');
  });
});
