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
import { createTheme } from '@mui/material/styles';
import denseTheme from './index';
import { TOKENS, DF_TOKEN_NAMES, DfTokenName, COLOR_SCHEMES, SCHEME_BASES, ColorScheme } from './tokens.def';
import { T, cssVarName } from './tokens';
import definitions from './tokens.def.json';

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
  ['surfaceShell',         '#edeef0', 'the canvas panel cards float on (new in the card layout)'],
  ['surfacePanel',         '#fafafa', 'layoutTokens.PANEL_SURFACE, LegendStack/LegendPanel .container'],
  ['surfaceSunken',        '#f5f5f5', 'FilterFieldChip .disabled, DataSourceSelectionPage blocks'],
  ['surfaceSubtle',        '#f9f9f9', 'DropZone.module.css resting background'],
  ['surfaceHeader',        '#e3f2fd', 'layoutTokens.PANEL_HEADER_SURFACE, VisualizationPage app title row'],
  ['surfaceAccentSubtle',  '#f0f7ff', 'PropertyDropZone.module.css empty state'],
  ['surfaceRaisedAlpha',   'rgba(255, 255, 255, 0.92)', 'DiscreteFilterControl.module.css .compactToggle'],
  ['borderHairline',       '#e0e0e0', '42 sites: FilterFieldChip, FilterDropZone, DebugPanel, ChartControls'],
  ['borderMuted',          '#dddddd', 'ChartGrid.module.css scroll layers, App.css th/td'],
  ['borderStrong',         '#cccccc', 'DropZone.module.css, App.css inputs, DROPZONE_STYLES separator'],
  ['borderSubtle',         '#eeeeee', 'DataSourceSelectionPage disabled inputs'],
  ['borderDisabled',       '#9e9e9e', 'FilterFieldChip.module.css .disabled'],
  ['borderAlpha',          'rgba(0, 0, 0, 0.2)', 'ManualColorSelector swatch, ChartTypeControl frame'],
  ['borderSwatch',         'rgba(0, 0, 0, 0.1)', 'ColorPalettePopover / BackgroundFieldControl colour samples'],
  ['borderNeutralMid',     '#999999', 'FieldChip.module.css generic hover border'],
  ['borderNeutralDark',    '#666666', 'FieldChip.module.css selected border (!important)'],
  ['textStrong',           '#333333', '16 sites incl. FieldChip.module.css, LegendPanel .title'],
  ['textInk',              '#222222', 'ChartGrid.module.css .tableCellText'],
  ['textDim',              '#555555', 'LegendPanel .gradientLabels / .legendLabel'],
  ['textMuted',            '#666666', '43 sites — the most duplicated literal in the app'],
  ['textFaint',            '#999999', 'ContextMenu disabled, DataSourceSelectionPage hints'],
  ['textInverse',          '#ffffff', 'the bare <button> in App.css and the load-demo button; ink on an MUI *.main fill uses textOnAccent/textOnWarning instead'],
  ['textGhost',            'rgba(0, 0, 0, 0.55)', 'FilterFieldChip.module.css muted measure label'],
  ['textLabel',            'rgba(0, 0, 0, 0.7)', 'DiscreteFilterControl / ContinuousFilterControl row labels'],
  ['textControlLabel',     '#424242', 'Label/SizeRange/SeriesLabel control captions (6 sites)'],
  ['flavourDiscreteBg',     '#e3f2fd', 'FieldChip.module.css + FilterFieldChip.module.css (2 dead JS copies deleted)'],
  ['flavourDiscreteBorder', '#1976d2', 'also the flavour glyph in FieldChip/FieldChipLabel.module.css'],
  ['flavourContinuousBg',     '#e8f5e8', 'FieldChip.module.css + FilterFieldChip.module.css'],
  ['flavourContinuousBorder', '#388e3c', 'also the flavour glyph in FieldChipLabel.module.css'],
  ['flavourInvalidBg',     '#fde7e9', 'FieldChip.module.css .invalidAxisField'],
  ['flavourInvalidBorder', '#e57373', 'FieldChip.module.css .invalidAxisField'],
  ['toggleActiveBg',     '#e6f4ea', 'DiscreteFilterControl + FieldsPanel .toggleActive (both !important)'],
  ['toggleActiveInk',    '#1b5e20', 'same two sources'],
  ['toggleActiveBorder', '#b7dfbb', 'same two sources'],
  // The filter scope toggle used `secondary.light` / `secondary.contrastText`
  // / `secondary.main` directly. Light keeps exactly those values; dark had to
  // leave the MUI role behind, because dark `secondary.light` is #f3e5f5 — a
  // near-white slab, with `secondary.main` *darker* underneath it on hover.
  ['scopeToggleBg',      '#ba68c8', 'FilterFieldChip scope toggle, selected (was secondary.light)'],
  ['scopeToggleInk',     '#ffffff', 'same toggle (was secondary.contrastText)'],
  ['scopeToggleHoverBg', '#9c27b0', 'same toggle, hovered (was secondary.main)'],
  ['dropAcceptBorder', '#2196f3', 'DropZone .isOver, FieldChip .dragOver'],
  ['dropReadyBorder',  '#4caf50', 'DropZone .canDrop'],
  ['dropReadyBg',      '#f1f8e9', 'DropZone .canDrop'],
  ['dropRejectBorder', '#f44336', 'FieldsPanel .dragOver — red because dropping there REMOVES'],
  ['dragOutline',      'rgba(0, 0, 0, 0.25)', 'FieldChip.module.css .dragging outline'],
  ['inputUnderline',      'rgba(0, 0, 0, 0.2)',  'FilterFieldChip.tsx compact MUI Input underline'],
  ['inputUnderlineHover', 'rgba(0, 0, 0, 0.35)', 'FilterFieldChip.tsx compact Input underline, hovered'],
  ['chartGridDivider', '#99a795', 'chartLayoutConfig.GRID_DIVIDER_COLOR — every facet/cell divider'],
  ['chartCellBg',      '#ffffff', 'ChartGrid.module.css .plotWrapper / .tableCell / .emptyCell'],
  ['chartBrushFill',   'rgba(70, 130, 180, 0.15)', 'BrushOverlay.tsx x- and y-locked selection'],
  ['chartBrushEdge',   'rgba(70, 130, 180, 0.5)',  'BrushOverlay.tsx selection edges'],
  ['scrollThumb',      '#888888', 'ChartGrid.module.css scrollbar thumbs'],
  ['scrollTrack',      '#f1f1f1', 'ChartGrid / LegendStack scrollbar tracks'],
  ['inverseSurface',   'rgba(20, 20, 20, 0.95)', 'CustomTooltip.css and .plot-tip in index.css'],
  ['inverseBorder',    'rgba(255, 255, 255, 0.2)', 'CustomTooltip.css and .plot-tip in index.css'],
  ['overlayScrim',     'rgba(0, 0, 0, 0.75)', 'ChartGrid.module.css .keyboardNavHint'],
  ['shadowFaint',      'rgba(0, 0, 0, 0.06)', 'FieldOverrideRow / OverlaysSection expanded rows'],
  ['shadowMedium',     'rgba(0, 0, 0, 0.2)',  'ManualColorSelector swatch shadow, scheme popover'],
  ['markerExperimental', '#ffb74d', 'ChartTypeControl EXPERIMENTAL badge'],
  ['profileMedian',      '#0d47a1', 'QuickViewPanel box-plot median'],
  ['profileEmpty',       '#90caf9', 'QuickViewPanel validity bar: empty strings'],
  ['profileProblem',     '#ef9a9a', 'QuickViewPanel validity bar: non-finite'],
  ['profileProblemSoft', '#f5b7b7', 'QuickViewPanel histogram empty slots'],
  ['profileMissing',     '#d8d8d8', 'QuickViewPanel validity bar: nulls'],
  ['profileWhisker',     '#bbbbbb', 'QuickViewPanel box-plot whiskers'],
  ['profileHighlight',   '#bbdefb', 'QuickViewPanel top-value bar fill'],
  ['trackMuted',         'rgba(0, 0, 0, 0.1)', 'LoadingModal progress track'],
  ['plainButtonBg',         '#007bff', 'App.css bare <button> — pre-MUI global styling'],
  ['plainButtonHoverBg',    '#0056b3', 'App.css bare <button>:hover'],
  ['plainButtonDisabledBg', '#cccccc', 'App.css bare <button>:disabled'],
  ['textDisabledInk',   '#8a8a8a', 'DataSourceSelectionPage disabled form text (no MUI on that page)'],
  ['surfaceDisabled',   '#eeeeee', 'DataSourceSelectionPage disabled inputs/fieldsets'],
  ['actionSuccessBg',   '#388e3c', 'DataSourceSelectionPage load-demo button'],
  ['sliderRailDisabled', '#bdbdbd', 'ColorBiasControl disabled rail'],
  ['surfaceRaisedScrim', 'rgba(255, 255, 255, 0.6)', 'ChartTypeControl framed selector'],
];

/** Tokens intentionally identical in both schemes, with the reason. */
const SCHEME_INVARIANT: Array<[DfTokenName, string]> = [
  ['inverseSurface',   'the tooltips are a dark slab by design, in both themes'],
  ['inverseText',      'sits on inverseSurface'],
  ['inverseTextMuted', 'sits on inverseSurface'],
  ['inverseBorder',    'sits on inverseSurface'],
  ['inverseFillSubtle', 'part of the inverse slab: dark in both themes'],
  ['inverseFill', 'part of the inverse slab: dark in both themes'],
  ['inverseFillSelected', 'part of the inverse slab: dark in both themes'],
  ['inverseFillHover', 'part of the inverse slab: dark in both themes'],
  ['inverseFillStrong', 'part of the inverse slab: dark in both themes'],
  ['chartBadgeSurface', 'a dark chip over the plot, dark in both themes'],
  ['statusInfoSurface', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusInfoInk', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusInfoBorder', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusWarningSurface', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusWarningInk', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusWarningBorder', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusSuccessSurface', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusSuccessInk', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusSuccessBorder', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusErrorSurface', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusErrorInk', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['statusErrorBorder', 'delegates to MUI\'s Alert palette, which flips on its own'],
  ['calloutPlate', 'a translucent white plate on a tinted callout, both themes'],
  ['calloutPlateSoft', 'a translucent white plate on a tinted callout, both themes'],
  ['panelRadius', 'geometry, not colour: the same curve in both themes'],
  ['sectionInset', 'geometry, not colour: the same gap under every section header'],
  ['inverseBorderSubtle', 'part of the inverse slab: dark in both themes'],
  ['inverseBorderStrong', 'part of the inverse slab: dark in both themes'],
  ['inverseBorderEmphasis', 'part of the inverse slab: dark in both themes'],
  ['inverseTextFaint', 'part of the inverse slab: dark in both themes'],
  ['inverseTextDim', 'part of the inverse slab: dark in both themes'],
  ['inverseTextSoft', 'part of the inverse slab: dark in both themes'],
  ['inverseAccent', 'part of the inverse slab: dark in both themes'],
  ['inverseActionKeep', 'part of the inverse slab: dark in both themes'],
  ['inverseActionExclude', 'part of the inverse slab: dark in both themes'],
  ['inverseLink', 'part of the inverse slab: dark in both themes'],
  ['inverseLinkHover', 'part of the inverse slab: dark in both themes'],
  ['textInverse',      'ink on a fill that stays saturated in both themes (the bare <button> in App.css, the load-demo button)'],
  ['flavourInvalidBorder', 'the invalid-field red reads on both surfaces'],
];

// The shade digits matter: `grey-50` and `primary-100` are exactly the
// delegations that must be caught, since numbered ramps do not flip.
/**
 * Tokens that are not colours. The layout needs its card radius readable from
 * CSS as well as TypeScript, and this is the one place both views are generated
 * from — so it rides along rather than living in a second mechanism.
 */
const NON_COLOR_TOKENS: DfTokenName[] = ['panelRadius', 'sectionInset'];

const MUI_DELEGATION = /^var\(--mui-palette-([a-zA-Z0-9-]+), (.+)\)$/;

/**
 * Accent tints composite an alpha over an MUI *role* rather than naming a
 * colour, using the `*Channel` variables `extendTheme` emits for exactly this
 * purpose. The value string differs between schemes only in its fallback, so
 * these are treated as delegating: the channel carries the scheme change.
 */
const CHANNEL_DELEGATION = /^rgba\(var\(--mui-palette-([a-zA-Z0-9-]+Channel), ([^)]+)\) \/ [\d.]+\)$/;
const muiPath = (cssName: string) => cssName.replace('-', '.');
const at = (node: unknown, p: string): unknown =>
  p.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), node);

/**
 * The palette a delegating token actually resolves against: the *app's* theme,
 * not stock MUI. These were the same thing until the app began overriding a
 * dark palette value (`text.primary`, see index.ts), and the fallback inside
 * `var(--mui-palette-X, …)` has to match what the provider will inject — that
 * is the whole point of the fallback, which is what paints before the
 * provider's <style> lands. Light is still byte-identical to `createTheme`, and
 * the test below keeps checking the light fallbacks against it directly.
 */
const themeFor = (scheme: ColorScheme) => denseTheme.colorSchemes[scheme].palette;

/**
 * Which schemes are dark is read off the MUI palette rather than listed here,
 * so a new variant is covered by the contrast and surface checks below the
 * moment it is declared. A hand-maintained list fails the other way: a new
 * scheme that no test ever looks at.
 */
const DARK_SCHEMES = COLOR_SCHEMES.filter((scheme) => themeFor(scheme).mode === 'dark');
const LIGHT_SCHEMES = COLOR_SCHEMES.filter((scheme) => themeFor(scheme).mode === 'light');

/** Every scheme defined as a patch, paired with the scheme it patches. */
const VARIANTS = Object.entries(SCHEME_BASES) as Array<[ColorScheme, ColorScheme]>;

describe('token definitions', () => {
  it('defines the same tokens in every scheme', () => {
    for (const scheme of COLOR_SCHEMES) {
      expect({ scheme, keys: Object.keys(TOKENS[scheme]) })
        .toEqual({ scheme, keys: Object.keys(TOKENS.light) });
    }
    expect(COLOR_SCHEMES.length).toBeGreaterThanOrEqual(2);
    expect(DF_TOKEN_NAMES.length).toBeGreaterThan(50);
  });

  it('has no empty or obviously malformed values', () => {
    const bad = COLOR_SCHEMES.flatMap((scheme) =>
      DF_TOKEN_NAMES
        .filter((name) => NON_COLOR_TOKENS.indexOf(name) === -1)
        .filter((name) => !/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\()/i.test(TOKENS[scheme][name]))
        .map((name) => `  ${scheme}.${name} = ${TOKENS[scheme][name]}`),
    );
    expect(bad.join('\n')).toBe('');
  });

  it.each(ORIGINS)('%s still equals the literal it replaced (%s)', (name, literal) => {
    expect(TOKENS.light[name]).toBe(literal);
  });

  it.each(SCHEME_INVARIANT)('%s is identical in every scheme (%s)', (name) => {
    for (const scheme of COLOR_SCHEMES) {
      expect({ scheme, value: TOKENS[scheme][name] })
        .toEqual({ scheme, value: TOKENS.light[name] });
    }
  });

  it('changes every other token between light and dark, so nothing is forgotten', () => {
    const invariant = SCHEME_INVARIANT.map(([name]) => name);
    const unchanged = DF_TOKEN_NAMES.filter(
      (name) => invariant.indexOf(name) === -1
        && TOKENS.light[name] === TOKENS.dark[name]
        && !MUI_DELEGATION.test(TOKENS.light[name])
        && !CHANNEL_DELEGATION.test(TOKENS.light[name]),
    );
    expect(unchanged).toEqual([]);
  });

  it.each(VARIANTS)('%s patches its base (%s) without restating it', (variant, base) => {
    // A patch that repeats a value it inherits is dead weight: it will not
    // follow the base when the base is re-tuned, which is the one thing the
    // patch form is for.
    const patched = DF_TOKEN_NAMES.filter((name) => TOKENS[variant][name] !== TOKENS[base][name]);
    const restated = Object.keys((definitions as Record<string, any>)[variant].values)
      .filter((name) => patched.indexOf(name as DfTokenName) === -1);

    expect(restated).toEqual([]);
    expect(patched.length).toBeGreaterThan(0);
  });

  it.each(VARIANTS)('%s inherits the surfaces it does not patch from %s', (variant, base) => {
    // The other half of the same contract: everything not listed is the base's.
    const patchKeys = Object.keys((definitions as Record<string, any>)[variant].values);
    const leaked = DF_TOKEN_NAMES.filter(
      (name) => patchKeys.indexOf(name) === -1 && TOKENS[variant][name] !== TOKENS[base][name],
    );
    expect(leaked).toEqual([]);
  });

  it('gives every channel-based tint a channel that flips between schemes', () => {
    const channelTokens = DF_TOKEN_NAMES
      .map((name) => [name, CHANNEL_DELEGATION.exec(TOKENS.light[name])] as const)
      .filter((entry) => entry[1] !== null);

    expect(channelTokens.length).toBeGreaterThan(0);
    for (const [name, match] of channelTokens) {
      const role = match![1].replace('Channel', '').replace('-', '.');
      const light = at(themeFor('light'), `${role}Channel`);
      const dark = at(themeFor('dark'), `${role}Channel`);
      expect(`${name}: ${String(light)}`).not.toBe(`${name}: ${String(dark)}`);
      // and the per-scheme fallback must be that scheme's channel value
      expect(match![2]).toBe(String(light));
      const darkMatch = CHANNEL_DELEGATION.exec(TOKENS.dark[name]);
      expect(darkMatch![2]).toBe(String(dark));
    }
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
    '%s carries the app theme\'s own value as its per-scheme fallback',
    (name) => {
      for (const scheme of COLOR_SCHEMES) {
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
    // Also the check that the generator and tokens.def.ts resolve `extends`
    // the same way: the values compared here are the resolved ones.
    for (const name of DF_TOKEN_NAMES) {
      for (const scheme of COLOR_SCHEMES) {
        expect(css).toContain(`  ${cssVarName(name)}: ${TOKENS[scheme][name]};`);
      }
    }
  });

  it('declares each token once per scheme', () => {
    const declared: string[] = css.match(/^ {2}--df-[a-z0-9-]+:/gm) ?? [];
    expect(declared.length).toBe(DF_TOKEN_NAMES.length * COLOR_SCHEMES.length);
  });

  it('gives every scheme but the base its own attribute block', () => {
    // `light` is :root; the rest key on the attribute ThemeRoot toggles, whose
    // value is the scheme's own name — which is what MUI writes there too.
    for (const scheme of COLOR_SCHEMES.filter((s) => s !== 'light')) {
      expect(css).toContain(`[data-df-color-scheme="${scheme}"] {`);
    }
    expect(css).toContain(':root {');
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

describe('native chrome in index.css', () => {
  /**
   * `color-scheme` drives the native scrollbars, checkboxes and form controls,
   * and it takes only the CSS keywords — so a variant cannot be a token and the
   * selector list has to name every dark scheme by hand. Forgetting one leaves
   * white scrollbars on a dark app, which no other test would notice.
   */
  it('declares color-scheme: dark for every dark scheme', () => {
    const css = fs.readFileSync(path.join(SRC_ROOT, 'index.css'), 'utf8');
    const rule = /((?:\[data-df-color-scheme="[a-z]+"\],?\s*)+)\{\s*color-scheme: dark;/.exec(css);

    expect(rule).not.toBeNull();
    for (const scheme of DARK_SCHEMES) {
      expect(rule![1]).toContain(`"${scheme}"`);
    }
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

/**
 * Relative luminance of an opaque hex colour, per WCAG. Returns null for
 * anything else (var() references, rgba) — those delegate or composite, so
 * their resolved value is not knowable here.
 */
const luminance = (value: string): number | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const channels = [0, 2, 4].map((i) => parseInt(match[1].substr(i, 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('the dark scheme is actually dark', () => {
  /** Surfaces must be dark in dark mode — the `grey.50` trap, for literals. */
  const SURFACES: DfTokenName[] = [
    'surfaceShell', 'surfacePanel', 'surfaceRaised', 'surfaceSunken',
    'surfaceSubtle', 'chartCanvas', 'chartCellBg', 'chartPlotBg', 'chartHalo',
  ];
  /**
   * Foregrounds are checked by *contrast* rather than by lightness: `textMuted`
   * and `textDim` are deliberately mid-greys, so "is it light?" is the wrong
   * question. What must hold is that each one reads against the surface it sits
   * on — in both schemes, which is exactly what a hand-written dark palette
   * tends to get wrong.
   */
  const FOREGROUNDS: Array<[DfTokenName, number]> = [
    ['textStrong', 4.5],
    ['textInk', 4.5],
    ['chartInk', 4.5],
    ['chartLabelInk', 4.5],
    ['textDim', 3],
    ['textMuted', 3],
  ];

  /**
   * How light a light scheme's surface has to be.
   *
   * Deliberately looser than the dark ceiling (0.1), and not symmetric with it.
   * The check exists to catch a surface that did not follow its scheme — the
   * `grey.50` trap, for literals — and 0.6 is still well above mid-grey, so a
   * genuinely dark value in a light scheme fails. It is not there to police how
   * deep a tinted canvas goes: `solarized` puts its canvas below base2 (0.75)
   * on purpose, because the cards have to read against it and base3 is spoken
   * for by the chart paper. The first pass at 0.8 was tight enough to block
   * that, which is a test dictating a palette rather than checking one.
   */
  const LIGHT_SURFACE_FLOOR = 0.6;

  /** WCAG contrast ratio between two opaque colours. */
  const contrast = (a: string, b: string): number => {
    const la = luminance(a)!;
    const lb = luminance(b)!;
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(SURFACES)('%s stays on the right side of the ramp in every scheme', (name) => {
    // The `grey.50` trap, for literals: a surface that did not follow its
    // scheme. Keyed off the MUI palette mode rather than the scheme name, so a
    // variant is covered the moment it is declared.
    expect(DARK_SCHEMES.length).toBeGreaterThan(0);
    expect(LIGHT_SCHEMES.length).toBeGreaterThan(0);

    for (const scheme of DARK_SCHEMES) {
      const value = luminance(TOKENS[scheme][name]);
      expect({ scheme, name, parsed: value !== null }).toEqual({ scheme, name, parsed: true });
      expect(value!).toBeLessThan(0.1);
    }
    for (const scheme of LIGHT_SCHEMES) {
      const value = luminance(TOKENS[scheme][name]);
      expect({ scheme, name, parsed: value !== null }).toEqual({ scheme, name, parsed: true });
      expect(value!).toBeGreaterThan(LIGHT_SURFACE_FLOOR);
    }
  });

  it.each(FOREGROUNDS)('%s stays readable on the panel surface (>= %s:1) in every scheme', (name, minRatio) => {
    for (const scheme of COLOR_SCHEMES) {
      const ratio = contrast(TOKENS[scheme][name], TOKENS[scheme].surfacePanel);
      expect({ scheme, name, ratio: Math.round(ratio * 10) / 10 })
        .toEqual({ scheme, name, ratio: expect.any(Number) });
      expect(ratio).toBeGreaterThanOrEqual(minRatio);
    }
  });

  it('keeps chart ink readable on the chart cell, not just the panel', () => {
    for (const scheme of COLOR_SCHEMES) {
      expect(contrast(TOKENS[scheme].chartInk, TOKENS[scheme].chartCellBg)).toBeGreaterThanOrEqual(4.5);
      // Data labels sit on marks but their halo is the cell, so the halo must
      // contrast with the ink it surrounds.
      expect(contrast(TOKENS[scheme].chartLabelInk, TOKENS[scheme].chartHalo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the elevation ramp ordered in every scheme', () => {
    // Cards must read against the canvas, and the canvas is the darkest of the
    // three in every scheme — in light because the cards are white, in the dark
    // schemes because elevation lifts.
    for (const scheme of COLOR_SCHEMES) {
      const [shell, panel, raised] = (['surfaceShell', 'surfacePanel', 'surfaceRaised'] as DfTokenName[])
        .map((n) => luminance(TOKENS[scheme][n])!);
      expect({ scheme, ordered: shell < panel && panel < raised })
        .toEqual({ scheme, ordered: true });
    }
  });

  it('gives the canvas and a card enough separation to be distinguishable', () => {
    for (const scheme of COLOR_SCHEMES) {
      const shell = luminance(TOKENS[scheme].surfaceShell)!;
      const raised = luminance(TOKENS[scheme].surfaceRaised)!;
      expect(Math.abs(raised - shell)).toBeGreaterThan(0.01);
    }
  });
});
