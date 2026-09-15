// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Locks the token layer against the three ways it can silently rot:
 *
 *  1. a light value drifting away from the literal it was introduced to replace
 *     (`#f5f5f5` quietly becoming `#f0f0f0` during a sweep),
 *  2. a token delegating to an MUI palette role that does NOT differ between
 *     the light and dark schemes — `grey.*` and `common.*` are shared ramps, so
 *     a surface built on `grey.50` would stay near-white in dark mode,
 *  3. the generated CSS falling out of step with the JSON it is generated from,
 *     or a `var(--df-…)` name being referenced that no token defines. Neither
 *     failure is visible to the compiler or the build: an unknown custom
 *     property just drops the declaration.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createTheme, experimental_extendTheme as extendTheme } from '@mui/material/styles';
import { TOKENS, DF_TOKEN_NAMES, DfTokenName } from './tokens.def';
import { T, cssVarName } from './tokens';

const SRC_ROOT = path.resolve(__dirname, '..');
const GENERATED_CSS = path.join(__dirname, 'tokens.generated.css');

/**
 * Light values that exist to replace a specific literal already in the app.
 * Each row names where that literal lives today, so a future edit has to
 * confront what it is about to move. Not every token appears here — some are
 * new roles introduced for dark mode (e.g. chart cell backgrounds).
 */
const ORIGINS: Array<[DfTokenName, string, string]> = [
  ['surfaceCanvas',        '#fcfcfc', 'ChartGrid.module.css .container, ChartArea.module.css .container'],
  ['surfacePanel',         '#fafafa', 'layoutTokens.PANEL_SURFACE, LegendStack/LegendPanel .container'],
  ['surfaceSunken',        '#f5f5f5', 'FilterFieldChip .disabled, DataSourceSelectionPage blocks'],
  ['surfaceSubtle',        '#f9f9f9', 'DropZone.module.css resting background'],
  ['surfaceHeader',        '#e3f2fd', 'layoutTokens.PANEL_HEADER_SURFACE, VisualizationPage app title row'],
  ['surfaceAccentSubtle',  '#f0f7ff', 'PropertyDropZone.module.css empty state'],
  ['borderHairline',       '#e0e0e0', '42 sites: FilterFieldChip, FilterDropZone, DebugPanel, ChartControls'],
  ['borderMuted',          '#dddddd', 'ChartGrid.module.css scroll layers, App.css th/td'],
  ['borderStrong',         '#cccccc', 'DropZone.module.css, App.css inputs, DROPZONE_STYLES separator'],
  ['borderSubtle',         '#eeeeee', 'DataSourceSelectionPage disabled inputs'],
  ['borderNeutralMid',     '#999999', 'FieldChip.module.css generic hover border'],
  ['borderNeutralDark',    '#666666', 'FieldChip.module.css selected border (!important)'],
  ['textStrong',           '#333333', '16 sites incl. FieldChip.module.css, LegendPanel .title'],
  ['textInk',              '#222222', 'ChartGrid.module.css .tableCellText'],
  ['textDim',              '#555555', 'LegendPanel .gradientLabels / .legendLabel'],
  ['textMuted',            '#666666', '43 sites — the most duplicated literal in the app'],
  ['textFaint',            '#999999', 'ContextMenu disabled, DataSourceSelectionPage hints'],
  ['textInverse',          '#ffffff', 'VirtualResizeLine badge, ChartGrid .keyboardNavHint'],
  ['flavourDiscreteBg',     '#e3f2fd', 'FieldChip.module.css + chipStyles.ts + overrideUtils.ts + FilterFieldChip'],
  ['flavourDiscreteBorder', '#1976d2', 'same four sources — the duplicated flavour pair'],
  ['flavourContinuousBg',     '#e8f5e8', 'same four sources'],
  ['flavourContinuousBorder', '#388e3c', 'same four sources'],
  ['flavourInvalidBg',     '#fde7e9', 'FieldChip.module.css .invalidAxisField'],
  ['flavourInvalidBorder', '#e57373', 'FieldChip.module.css .invalidAxisField'],
  ['toggleActiveBg',     '#e6f4ea', 'DiscreteFilterControl + FieldsPanel .toggleActive (both !important)'],
  ['toggleActiveInk',    '#1b5e20', 'same two sources'],
  ['toggleActiveBorder', '#b7dfbb', 'same two sources'],
  ['dropAcceptBorder', '#2196f3', 'DropZone .isOver, FieldChip .dragOver'],
  ['dropReadyBorder',  '#4caf50', 'DropZone .canDrop'],
  ['dropReadyBg',      '#f1f8e9', 'DropZone .canDrop'],
  ['dropRejectBorder', '#f44336', 'FieldsPanel .dragOver — red because dropping there REMOVES'],
  ['chartGridDivider', '#99a795', 'chartLayoutConfig.GRID_DIVIDER_COLOR — every facet/cell divider'],
  ['chartCellBg',      '#ffffff', 'ChartGrid.module.css .plotWrapper / .tableCell / .emptyCell'],
  ['chartBrushFill',   'rgba(70, 130, 180, 0.15)', 'BrushOverlay.tsx x- and y-locked selection'],
  ['chartBrushEdge',   'rgba(70, 130, 180, 0.5)',  'BrushOverlay.tsx selection edges'],
  ['scrollThumb',      '#888888', 'ChartGrid.module.css scrollbar thumbs'],
  ['scrollTrack',      '#f1f1f1', 'ChartGrid / LegendStack scrollbar tracks'],
  ['inverseSurface',   'rgba(20, 20, 20, 0.95)', 'CustomTooltip.css and .plot-tip in index.css'],
  ['inverseBorder',    'rgba(255, 255, 255, 0.2)', 'CustomTooltip.css and .plot-tip in index.css'],
  ['overlayScrim',     'rgba(0, 0, 0, 0.75)', 'ChartGrid.module.css .keyboardNavHint'],
];

/** Tokens intentionally identical in both schemes, with the reason. */
const SCHEME_INVARIANT: Array<[DfTokenName, string]> = [
  ['inverseSurface',   'the tooltips are a dark slab by design, in both themes'],
  ['inverseText',      'sits on inverseSurface'],
  ['inverseTextMuted', 'sits on inverseSurface'],
  ['inverseBorder',    'sits on inverseSurface'],
  ['textInverse',      'text on a dark badge/chip stays white in both themes'],
  ['flavourInvalidBorder', 'the invalid-field red reads on both surfaces'],
];

// The shade digits matter: `grey-50` and `primary-100` are exactly the
// delegations that must be caught, since numbered ramps do not flip.
const MUI_DELEGATION = /^var\(--mui-palette-([a-zA-Z0-9-]+), (.+)\)$/;
const muiPath = (cssName: string) => cssName.replace('-', '.');
const at = (node: unknown, p: string): unknown =>
  p.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), node);

const themeFor = (scheme: 'light' | 'dark') =>
  extendTheme().colorSchemes[scheme].palette;

describe('token definitions', () => {
  it('defines the same tokens in both schemes', () => {
    expect(Object.keys(TOKENS.dark)).toEqual(Object.keys(TOKENS.light));
    expect(DF_TOKEN_NAMES.length).toBeGreaterThan(50);
  });

  it('has no empty or obviously malformed values', () => {
    const bad = (['light', 'dark'] as const).flatMap((scheme) =>
      DF_TOKEN_NAMES.filter((name) => !/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\()/i.test(TOKENS[scheme][name]))
        .map((name) => `  ${scheme}.${name} = ${TOKENS[scheme][name]}`),
    );
    expect(bad.join('\n')).toBe('');
  });

  it.each(ORIGINS)('%s still equals the literal it replaced (%s)', (name, literal) => {
    expect(TOKENS.light[name]).toBe(literal);
  });

  it.each(SCHEME_INVARIANT)('%s is identical in both schemes (%s)', (name) => {
    expect(TOKENS.dark[name]).toBe(TOKENS.light[name]);
  });

  it('changes every other token between schemes, so nothing is forgotten', () => {
    const invariant = new Set(SCHEME_INVARIANT.map(([name]) => name));
    const unchanged = DF_TOKEN_NAMES.filter(
      (name) => !invariant.has(name)
        && TOKENS.light[name] === TOKENS.dark[name]
        && !MUI_DELEGATION.test(TOKENS.light[name]),
    );
    expect(unchanged).toEqual([]);
  });
});

describe('tokens that delegate to the MUI palette', () => {
  const delegating = DF_TOKEN_NAMES
    .map((name) => [name, MUI_DELEGATION.exec(TOKENS.light[name])] as const)
    .filter((entry): entry is readonly [DfTokenName, RegExpExecArray] => entry[1] !== null);

  it('delegates for a meaningful number of tokens', () => {
    expect(delegating.length).toBeGreaterThan(10);
  });

  it.each(delegating.map(([name, match]) => [name, muiPath(match[1])]))(
    '%s delegates to a role (%s) that actually differs between schemes',
    (_name, role) => {
      // The grey.*/common.* trap: those ramps are shared by both schemes, so a
      // token delegating to them would not change in dark mode.
      expect(String(at(themeFor('light'), role))).not.toBe(String(at(themeFor('dark'), role)));
    },
  );

  it.each(delegating.map(([name]) => [name]))(
    '%s carries the stock MUI value as its per-scheme fallback',
    (name) => {
      for (const scheme of ['light', 'dark'] as const) {
        const match = MUI_DELEGATION.exec(TOKENS[scheme][name as DfTokenName]);
        expect(match).not.toBeNull();
        const [, role, fallback] = match!;
        expect(fallback).toBe(String(at(themeFor(scheme), muiPath(role))));
      }
    },
  );

  it('agrees with createTheme for the light fallbacks', () => {
    // Belt and braces: the fallback is what paints if the provider's <style>
    // has not landed yet, so it must equal what the app renders today.
    const stock = createTheme().palette;
    for (const [name, match] of delegating) {
      expect(match[2]).toBe(String(at(stock, muiPath(match[1]))));
      expect(name).toBeTruthy();
    }
  });
});

describe('generated CSS', () => {
  const css = fs.readFileSync(GENERATED_CSS, 'utf8');

  it('is in step with tokens.def.json (re-run npm run generate:tokens)', () => {
    for (const name of DF_TOKEN_NAMES) {
      expect(css).toContain(`  ${cssVarName(name)}: ${TOKENS.light[name]};`);
      expect(css).toContain(`  ${cssVarName(name)}: ${TOKENS.dark[name]};`);
    }
  });

  it('declares each token exactly twice — once per scheme', () => {
    const declared: string[] = css.match(/^ {2}--df-[a-z0-9-]+:/gm) ?? [];
    expect(declared.length).toBe(DF_TOKEN_NAMES.length * 2);
  });

  it('keys its dark block on the attribute ThemeRoot toggles', () => {
    expect(css).toContain('[data-df-color-scheme="dark"] {');
  });

  it('uses the same variable names that tokens.ts builds', () => {
    // scripts/generate-tokens.js and tokens.ts each own a copy of the
    // camelCase -> kebab-case transform; this is what keeps them honest.
    const inCss: string[] = css.match(/--df-[a-z0-9-]+/g) ?? [];
    const fromTs = DF_TOKEN_NAMES.map(cssVarName);
    expect(inCss.filter((name) => fromTs.indexOf(name) === -1)).toEqual([]);
    expect(fromTs.filter((name) => inCss.indexOf(name) === -1)).toEqual([]);
  });
});

describe('token references across the app', () => {
  const collect = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, out);
      else if (/\.(css|ts|tsx)$/.test(entry.name) && !full.endsWith('tokens.generated.css')) out.push(full);
    }
    return out;
  };

  it('references no --df-* variable that no token defines', () => {
    const known = DF_TOKEN_NAMES.map(cssVarName);
    const unknown: string[] = [];

    for (const file of collect(SRC_ROOT)) {
      const relative = `src/${path.relative(SRC_ROOT, file).split(path.sep).join('/')}`;
      for (const used of fs.readFileSync(file, 'utf8').match(/--df-[a-z0-9-]+/g) ?? []) {
        if (known.indexOf(used) === -1) unknown.push(`  ${used} in ${relative}`);
      }
    }

    expect(unknown.join('\n')).toBe('');
  });

  it('exposes every token through T', () => {
    expect(Object.keys(T).sort()).toEqual(DF_TOKEN_NAMES.slice().sort());
    expect(T.surfacePanel).toBe('var(--df-surface-panel)');
    expect(T.chartGridDivider).toBe('var(--df-chart-grid-divider)');
  });
});
