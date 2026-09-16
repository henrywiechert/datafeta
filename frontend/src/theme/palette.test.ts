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
import * as fs from 'fs';
import * as path from 'path';
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
  'warning.light', 'warning.dark', 'secondary.main',
  'secondary.light', 'secondary.contrastText', 'primary.contrastText',
  'background.default', 'action.disabledBackground',
  // Ink on a filled status role. These replaced the app's last two
  // `common.white` references: `common.*` is shared by both schemes, so white
  // ink stayed white on a fill that dark mode lightens. THEMING.md has the rule.
  'success.contrastText', 'error.contrastText', 'warning.contrastText',
];

/**
 * Every MUI palette path referenced anywhere in `src`, discovered by scanning
 * rather than listed by hand.
 *
 * This exists because of a real bug: five toggles in ChartControls and two
 * backgrounds in SqlQueryViewerDialog referenced `primary.50` / `primary.100` /
 * `info.50` / `success.50`, which MUI's default palette does not define (only
 * `grey` ships a 50–900 ramp). `sx` passes an unresolvable string through as a
 * raw CSS value, so `background-color: primary.50` was simply invalid and those
 * active states had no background at all — silently, for as long as the code
 * existed. Nothing failed; the styling just did not happen.
 *
 * The fix was not to define those shades: MUI's numbered ramps are shared
 * across colour schemes, so a literal light blue would have become a pale slab
 * on a dark toolbar. They now use channel-backed accent tints instead.
 */
const PALETTE_PATH = /'((?:primary|secondary|error|warning|info|success|grey|text|action|background|common)\.[A-Za-z0-9]+)'/g;

const collectSourceFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
};

const referencedPalettePaths = (): Map<string, string[]> => {
  const refs = new Map<string, string[]>();
  for (const file of collectSourceFiles(path.resolve(__dirname, '..'))) {
    const source = fs.readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    PALETTE_PATH.lastIndex = 0;
    while ((match = PALETTE_PATH.exec(source)) !== null) {
      const rel = `src/${path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/')}`;
      refs.set(match[1], (refs.get(match[1]) ?? []).concat(rel));
    }
  }
  return refs;
};

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

  it('references no palette path the theme does not define', () => {
    const unresolved: string[] = [];
    referencedPalettePaths().forEach((files, palettePath) => {
      if (at(lightPalette, palettePath) === undefined) {
        unresolved.push(`  ${palettePath} referenced in ${Array.from(new Set(files)).join(', ')}`);
      }
    });
    expect(unresolved.join('\n')).toBe('');
  });

  it('actually finds the palette references, so the scan cannot pass vacuously', () => {
    const found = referencedPalettePaths();
    expect(found.size).toBeGreaterThan(15);
    expect(found.has('text.secondary')).toBe(true);
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

  it('defines no light palette of its own, so app semantics stay in the --df-* layer', () => {
    expect(denseTheme.colorSchemes.light.palette.primary.main).toBe(stockPalette.primary.main);
    expect(denseTheme.colorSchemes.light.palette.text).toEqual(
      extendTheme().colorSchemes.light.palette.text,
    );
    expect(denseTheme.colorSchemes.light.palette.action).toEqual(
      extendTheme().colorSchemes.light.palette.action,
    );
  });

  it('softens the two dark values that un-roled content inherits, and nothing else', () => {
    const dark = denseTheme.colorSchemes.dark.palette;
    const stockDark = extendTheme().colorSchemes.dark.palette;

    // Both stock values are pure #fff, and between them they cover everything
    // that names no colour of its own: text.primary via body in index.css and
    // Typography's `color: inherit`, action.active via IconButton's default.
    // See the comments in index.ts.
    expect(stockDark.text.primary).toBe('#fff');
    expect(stockDark.action.active).toBe('#fff');
    expect(dark.text.primary).not.toBe('#fff');
    expect(dark.action.active).not.toBe('#fff');

    // An icon and a secondary label should weigh the same, which is the whole
    // point of the action.active value.
    expect(dark.action.active).toBe(dark.text.secondary);

    // The channels have to follow, or alpha composited on either would still
    // resolve against pure white.
    expect(dark.text.primaryChannel).not.toBe(stockDark.text.primaryChannel);
    expect(dark.action.activeChannel).toBe('255 255 255');

    // The overrides are a deep merge, so nothing else in the scheme moves — the
    // secondary/disabled steps the FieldsPanel headers already look right in
    // are untouched, and so are the surfaces and the rest of `action`.
    expect(dark.text.secondary).toBe(stockDark.text.secondary);
    expect(dark.text.disabled).toBe(stockDark.text.disabled);
    expect(dark.action.hover).toBe(stockDark.action.hover);
    expect(dark.action.disabled).toBe(stockDark.action.disabled);
    expect(dark.background.default).toBe('#121212');
    expect(dark.primary.main).toBe(stockDark.primary.main);
    expect(dark.mode).toBe('dark');
    expect(denseTheme.colorSchemes.light.palette.mode).toBe('light');
  });

  it('gives every scheme the common pair that matches its mode, not its name', () => {
    /*
     * `extendTheme` sets `common.background` / `common.onBackground` from
     * `key === 'light'` — the scheme's *name* — so every custom scheme gets the
     * dark pair regardless of its palette mode. `common.onBackgroundChannel` is
     * what MUI composites the resting border of OutlinedInput, the underline of
     * Input, the fill of FilledInput and the dividers of ButtonGroup and
     * PaginationItem from, so a light-mode scheme that inherits `#fff` has
     * invisible input borders until focus. Custom schemes seed the pair in
     * index.ts; this is the check that a future one does too.
     */
    const schemes = Object.keys(denseTheme.colorSchemes) as Array<'light' | 'dark' | 'dim' | 'solarized'>;
    expect(schemes.length).toBeGreaterThan(2);

    for (const scheme of schemes) {
      const palette = denseTheme.colorSchemes[scheme].palette;
      const expected = palette.mode === 'light'
        ? { background: '#fff', onBackground: '#000', channel: '0 0 0' }
        : { background: '#000', onBackground: '#fff', channel: '255 255 255' };

      expect({
        scheme,
        background: palette.common.background,
        onBackground: palette.common.onBackground,
        channel: palette.common.onBackgroundChannel,
      }).toEqual({ scheme, ...expected });
    }
  });

  it('keeps contrastText flipping, which is what the on-fill ink tokens ride on', () => {
    // --df-text-on-accent / --df-text-on-warning replaced a token that was
    // #ffffff in both schemes, so white ink landed on dark mode's *lightened*
    // primary.main (#90caf9) and warning.main (#ffa726) — 1.7:1 and 1.9:1.
    const light = denseTheme.colorSchemes.light.palette;
    const dark = denseTheme.colorSchemes.dark.palette;

    expect(light.primary.contrastText).toBe('#fff');
    expect(light.warning.contrastText).toBe('#fff');
    expect(dark.primary.contrastText).not.toBe('#fff');
    expect(dark.warning.contrastText).not.toBe('#fff');
  });
});
