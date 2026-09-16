# Theming

How color works in this app, and the rules that keep it working.

## Why this exists

Before the token layer, the app carried ~873 color literals across 105 files —
about 16 distinct greys serving maybe 6 semantic roles. `theme.ts` defined no
`palette` at all, only menu/dialog density, so every `'primary.main'` /
`'divider'` / `'action.hover'` reference resolved to *stock MUI defaults*. That
is the only reason the hand-written `#1976d2` and `#e0e0e0` literals looked
coherent: they happened to equal MUI's defaults.

That state made a dark theme impossible rather than merely hard, and made the
rounded-panel ("card") look pointless — cards only read as a system if an
elevation ramp is enforced by tokens rather than by convention.

## Two layers

| Layer | Owns | Mechanism |
|---|---|---|
| `--mui-palette-*` | MUI primitives: `primary.main`, `divider`, `action.hover`, `text.*`, `grey.*` | `experimental_extendTheme` + `Experimental_CssVarsProvider` |
| `--df-*` | App semantics: drag-over, active-toggle, field flavour, chart grid divider, plot background, label halo, scrollbars | Hand-authored, generated to CSS from one JSON source |

Both are needed.

**MUI primitives cannot be hand-rolled.** `createTheme({palette:{primary:{main:'var(--x)'}}})`
throws — `augmentColor` → `getContrastRatio` → `decomposeColor('var(...)')`. Even
supplying every shade by hand does not help, because MUI components internally
call `alpha(theme.palette.primary.main, …)`, which also throws on a `var()`
string. `extendTheme` precomputes the `*Channel` variables that make alpha
compositing work, so it is the only viable route.

**MUI's vocabulary is not enough.** `--mui-palette-*` has no name for
`drag-over`, `active-toggle`, `field-flavour-discrete`, `chart-grid-divider` or
`label-halo`. Those are app concepts and live in `--df-*`.

### Adding a scheme

`tokens.def.json` holds one entry per scheme. `light` is the base and becomes
`:root`; every other scheme gets `[data-df-color-scheme="<name>"]`, which is the
same attribute value MUI's provider writes, so the two layers cannot disagree
about which scheme is active.

A scheme is either a full table of values (`light`, `dark`) or a **patch** over
another:

```json
"dim": { "extends": "dark", "values": { "surfacePanel": "#1e2531", … } }
```

A variant that only lifts the surfaces has no business restating the other ~140
tokens. The patch form says what the variant *is*, and — more importantly — a
re-tune of `dark` reaches its variants instead of silently skipping them.
`tokens.test.ts` enforces both halves: a patch may not restate a value it would
inherit, and nothing outside the patch may differ from the base.

The merge is implemented twice (`scripts/generate-tokens.js` and
`tokens.def.ts`), for the same reason as the kebab-case transform — a build
script cannot import TypeScript. The "generated CSS is in step" test compares
resolved values, which is what keeps the two honest.

**Five things outside the token layer have to learn the new name.** All are
tested, because every one of them fails silently:

| where | what | test |
|---|---|---|
| `theme/index.ts` | the MUI palette for the scheme | `palette.test.ts` |
| `muiThemeAugmentation.d.ts` | `ColorSchemeOverrides`, or `colorSchemes.<name>` is a type error | `tokens.test.ts` scheme-parity |
| `index.css` | `color-scheme: dark` selector list — CSS keywords only, so it cannot be a token | `tokens.test.ts` native-chrome |
| `public/index.html` | the pre-paint script, which reads `<colorSchemeStorageKey>-<mode>` | `ThemeModeToggle.test.tsx` |
| `ThemeModeToggle.tsx` | a menu entry, or the scheme is unreachable | `ThemeModeToggle.test.tsx` |

**A custom scheme's MUI palette must be pre-augmented.** `extendTheme` only
augments `light` and `dark`: it iterates every scheme but ran just those two
through augmentation, so handing it a bare palette throws
`Cannot read properties of undefined (reading 'background')` from its own
`setColor` — `palette.common` was never built. Build it with
`createTheme({ palette: { mode: 'dark', … } }).palette` and pass the result.
`mode: 'dark'` then derives everything you do not name, so `primary.main` and
friends stay shared.

Two things that pre-augmentation does *not* give you, both silent:

- **`overlays`** — MUI's dark elevation tint for `Paper` — is defaulted for
  `light`/`dark` only. Copy `dark`'s array; it is a ladder of white alphas,
  independent of the paper colour.
- **`background.paper`** is what Menu, Dialog and Popover paint with, and stock
  dark leaves it at `#121212`, *darker* than the panels it opens over. A lifted
  scheme has to lift it too, or every menu reads as a hole punched in the card.
  (`dark` still has this mismatch. It predates the variant and wants its own
  screenshot.)

### A variant that changes hue, not just tone

`dim` patches 44 tokens; `solarized` patches 88, more than half the set. That is
the honest cost of a different hue family rather than a re-tone, and most of the
extra is not surfaces — it is everything that was quietly Material blue.

**Changing `primary` or a status role means patching every token that delegates
to it.** A token's fallback has to match what the provider will inject for *that
scheme* (see the `text.primary` note below), so a Solarized `primary.main`
invalidates the inherited fallbacks of `textAccent`, `borderAccent`,
`borderAccentStrong`, `dropCaret`, `profileValid`, `chartResizeHandle*`, the five
channel-backed accent tints, and the same again for `error`/`warning`/`success`/
`info` via the `status*` tokens. That is 21 tokens of pure bookkeeping, and
`tokens.test.ts` fails on each one individually if it drifts.

Generate them rather than typing them. Build the scheme's palette, then read
each delegating token's role off it:

```
node -e "… extendTheme({colorSchemes:{solarized:{palette}}}) …"   # see git log
```

Name the `dark` shades explicitly in the palette (`primary: { main, dark }`)
even though MUI would derive them: `augmentColor`'s `darken()` returns an
`rgb()` string, and a hex keeps the generated CSS readable.

**Do not invent the light end of a ramp, and reserve the palette's lightest
value for the chart paper.** The app needs three surface steps (canvas < panel <
card) plus the plot background, and Solarized Light offers two: base3 `#fdf6e3`
is the background, base2 `#eee8d5` the highlight. This took two corrections:

1. The first pass put the *cards* on an invented `#fffcf2`, one step above
   base3. That read as near-white across the four largest areas of the UI,
   because `--df-surface-raised` is the most-used surface token in the CSS —
   22 sites, including every PropertySection header, the filter value list, the
   resting drop zones, and the whole Fields panel body (which paints nothing of
   its own and simply shows its card).
2. Moving the cards onto base3 fixed those, but the Fields body was still too
   light: it is the largest uninterrupted surface in the app, and base3 is the
   lightest thing in the palette.

The shape that works: **base3 is the chart paper only** — the surface data is
drawn on, which is what it is in Solarized proper — and the UI chrome sits
below it, base2 for panels with one interpolated step above for cards and one
below for the canvas. So invent *inside* the range, never past its lightest
end, and remember that a large flat area reads lighter than the same colour in
a small card full of content.

**`extendTheme` decides `common.background` / `common.onBackground` from the
scheme's *name*, not its mode** — `key === 'light' ? … : …` — so every custom
scheme gets the dark pair. That matters more than it sounds:
`common.onBackgroundChannel` is what MUI composites the resting border of
`OutlinedInput`, the underline of `Input`, the fill of `FilledInput` and the
dividers of `ButtonGroup` and `PaginationItem` from. A light-mode variant that
inherits `#fff` has invisible input borders until they are focused. Seed the
pair in the scheme's palette (`setColor` only assigns when the key is absent);
`palette.test.ts` checks every scheme's pair against its mode.

**What a variant should leave alone.** `solarized` does not touch the
`profile*` histogram colours, `markerExperimental`, or `chartGridDivider` —
they are closer to data-vis than chrome, and the rule at the bottom of this file
applies: a theme flips surfaces, it does not redefine what a category looks
like. It also cannot touch the scheme-invariant tokens (the dark tooltip slab,
the `Alert` delegations); `tokens.test.ts` lists them with reasons.

### Modes and schemes are different axes

MUI's `mode` is `light | dark | system`. Which *scheme* serves a mode is a
second, independently stored choice (`<colorSchemeStorageKey>-<mode>`), which is
exactly what makes two schemes per mode possible: `dark` and `dim` are both the
dark *mode*, `light` and `solarized` both the light one, differing only in
scheme. So the toggle sets both — `setColorScheme({ dark: 'dim' })` and
`setMode('dark')` — and the pre-paint script has to read the scheme key rather
than assume `scheme === mode`, or picking a variant would flash the base scheme
on every reload.

Each mode's scheme is remembered independently of the mode, so picking Dim and
later Follow system means a system that reports dark gets dim.

### The two palette values the app overrides

MUI's dark scheme puts **pure `#fff`** at the top of two ramps, and between them
they cover everything in the app that does not choose a colour of its own. Both
overrides live in `index.ts`, in the MUI layer on purpose: **a `--df-*` token
cannot reach content that names no token.**

| dark leaf | stock | ours | what inherits it |
|---|---|---|---|
| `text.primary` | `#fff` | `#e8eaed` | `html, body` in `index.css` via `--df-text-primary` (there is no `CssBaseline`), and every `Typography`, whose default `color` is `inherit` |
| `action.active` | `#fff` | `rgba(255,255,255,0.7)` | every `IconButton` given `color="default"` or no colour — ~48 of the app's 79, plus the `default` branch of every `color={x ? 'primary' : 'default'}` toggle |

Light mode hid both splits. Un-roled text was `rgba(0,0,0,0.87)` next to
`#333`/`#666` tokens — three shades of "dark grey" — and `action.active`'s
`rgba(0,0,0,0.54)` sits right next to `text.secondary`'s `0.6`, so a default
icon and a `text.secondary` icon weighed the same. In dark they were `#fff`
against `0.7`: un-roled text glared beside `--df-text-secondary` (the FieldsPanel
category headers), and the left half of the chart-config toolbar (terminal,
fullscreen, table, title, swap — all `color="default"`) glared beside the right
half (refresh, settings, axis links — all explicit `text.secondary`).

`action.active` is matched to `text.secondary` exactly, so an icon and its label
carry the same weight. Softening the top of both ramps is a two-line fix for the
whole app; assigning explicit roles to the content underneath is the separate,
larger pass. Light is untouched, so `palette.test.ts`'s lock on every light leaf
still holds.

**When adding a dark override, check the `*Channel` value survives.** MUI
composites alpha as `rgba(var(--mui-palette-X-channel) / opacity)`, so a leaf
whose channel silently kept pointing at white would undo the change for every
hover and tint built on it. `extendTheme` recomputes the channel from an `rgba()`
string correctly (`text.primaryChannel` becomes `232 234 237`;
`action.activeChannel` stays `255 255 255`, which is right — the alpha moved, not
the hue), and `palette.test.ts` asserts it.

One consequence for the token layer: `--df-text-primary`'s dark **fallback** is
`#e8eaed`, not MUI's `#fff`. A delegating token's fallback is what paints before
the provider's `<style>` lands, so it has to match the app's theme rather than
stock MUI — which is what `themeFor()` in `tokens.test.ts` now checks against.

## The invariant

> **Naming a literal is not the same as unifying it.**

Two literals that *look* alike but *are* different get two tokens. This is the
one rule that keeps "zero visual change" true during migration:

- MUI `divider` is `rgba(0, 0, 0, 0.12)`. That equals `#e0e0e0` **only when
  composited over pure white**. Over `--df-surface-panel` (`#fafafa`) it lands
  around `#dcdcdc`. There are ~42 `#e0e0e0` literals and many sit on `#fafafa`
  or `#f5f5f5` surfaces, so aliasing the two is a visual change on every panel
  that isn't white.
- The same trap applies to `#333` vs `text.primary` (`rgba(0,0,0,0.87)`) and
  `#666` vs `text.secondary` (`rgba(0,0,0,0.6)`).

So `--df-border-hairline: #e0e0e0` and `--df-border-divider: var(--mui-palette-divider)`
both exist, on purpose.

**Corollary:** a `--df-*` token may be defined as `var(--mui-palette-X)` only
when today's rendered value is bit-identical to MUI's default for X.
`#1976d2 === primary.main` is fine. `#e0e0e0 === divider` is not.

### A token may only delegate to an MUI role that actually flips

The second half of the rule, and the less obvious one. MUI's `grey.*` ramp and
`common.*` are **shared by both color schemes** — `grey.50` is `#fafafa` in
light *and* in dark. So even though `#fafafa === grey.50` exactly, defining

```
--df-surface-panel: var(--mui-palette-grey-50);   /* WRONG */
```

would leave every panel near-white in dark mode. Only roles that differ between
the schemes are safe to delegate to; verified flipping roles include
`primary.*`, `error/warning/success/info.main`, `text.*`, `action.*`, `divider`
and `background.*`. Surfaces and the grey ladder are therefore per-scheme
literals in `tokens.def.json`.

`tokens.test.ts` enforces this: every delegating token is checked to point at a
role whose light and dark values actually differ.

### Ink on a filled surface names the fill, not a colour

A token for text sitting on a *filled* surface has to flip with that fill, and
MUI already has the role for it: `X.contrastText`. Hence

| token | ink for | delegates to |
|---|---|---|
| `--df-text-on-accent` | anything filled with `primary.main` — `--df-text-accent`, `--df-border-accent`, `--df-profile-valid` | `primary.contrastText` |
| `--df-text-on-warning` | anything filled with `warning.main` / `warning.dark` | `warning.contrastText` |
| `--df-text-inverse` | a fill that stays saturated in *both* schemes: the bare `<button>` in `App.css`, the load-demo button | nothing — literal `#ffffff` |

The first two exist because the third was being used for all three jobs. `#ffffff`
in both schemes is right for a dark fill and wrong for an MUI role, because
dark mode *lightens* those roles: `primary.main` becomes `#90caf9` and
`warning.main` `#ffa726`, so white ink landed at 1.7:1 and 1.9:1 — illegible,
in eight places. `contrastText` flips to `rgba(0,0,0,0.87)` for exactly this
reason, and in light mode it is `#fff`, so the migration is a no-op there.

**So: never reach for `--df-text-inverse` on a fill that is an MUI palette
role.** The remaining two `textInverse` sites sit on `--df-plain-button-bg` and
`--df-action-success-bg`, which are app literals rather than MUI roles — their
dark values (`#3d8bfd`, `#43a047`) are lightened enough to put white ink at
~3.3:1. Darkening those two fills is a tone decision, not a token bug, and is
still open.

Collapsing the grey ladder into ~6 roles is a later, separately reviewed change
with a screenshot diff behind it. A token named after a literal's role can be
retired later; a token that silently changed a value cannot be un-shipped.

## How to consume a token

| Consumer | Mechanism |
|---|---|
| CSS module | `background: var(--df-surface-panel)` — no import needed |
| `sx` prop | Keep using MUI keys: `sx={{ color: 'text.secondary' }}`. Reach for `T.*` only where MUI has no equivalent |
| Raw inline `style` | The same `var()` string, interpolated into the declaration |
| SVG attribute | The same `var()` string — Observable Plot's `isColor()` accepts `var(...)` |
| JS needing a parseable value | `useChartChrome()` / `chartChromeFor(scheme)`, which return concrete values, not `var()` |

**`sx` does not migrate.** Do not rewrite `sx={{ color: 'text.secondary' }}`
into a token — MUI palette keys are already themeable under CssVars, and
leaving them alone keeps ~150 references at zero migration cost.

**Never read a token with `getComputedStyle`.** jsdom does not resolve `var()`
at all, so anything built that way is untestable. Values that JS genuinely
needs come from the TypeScript side of the generated pair.

**Never hand-write a `--df-*` name in CSS.** The names are derived from the
token module's keys. A typo in `var(--df-typo)` silently falls back and the
build stays green — nothing in the toolchain catches it.

## The token files

| File | Role |
|---|---|
| `tokens.def.json` | **Source of truth.** Light and dark values, same keys in both. JSON so the generator needs no TypeScript parser. |
| `tokens.def.ts` | Types it, and exposes `TOKENS[scheme]` for the few consumers that need a concrete value rather than a `var()`. |
| `tokens.ts` | Builds the `var()` strings. `T.surfacePanel === 'var(--df-surface-panel)'`. The only place those strings are constructed, so a typo is a compile error. |
| `tokens.generated.css` | Generated. `:root` for light, `[data-df-color-scheme="dark"]` for dark — the same attribute `ThemeRoot` toggles, so one flip switches both layers. Committed, so a fresh clone and `npm test` work without running the generator. |
| `scripts/generate-tokens.js` | Runs from `prestart`/`prebuild` beside `generate-version.js`. Also `npm run generate:tokens`. Fails if the two schemes disagree on keys. |

Token names are camelCase in TypeScript and kebab-case in CSS
(`surfacePanel` ⇄ `--df-surface-panel`). The transform is implemented twice —
once in `tokens.ts`, once in the generator — and `tokens.test.ts` asserts the
two agree, which is cheaper than making a build script import TypeScript.

The schemes today are `light`, `dark`, `dim` (a lifted, cooled, softer dark) and
`solarized` (Solarized Light). Both variants are patches — `dim` over `dark`,
`solarized` over `light`. See "Adding a scheme" above.

## The card layout

Panels are cards floating on a shell canvas, and that only works if three
things agree:

1. **`--df-surface-shell` is darker than every panel surface.** The contrast
   between canvas and card is the entire effect; if they converge, the layout
   reads as a flat list again.
2. **The gaps are the same size everywhere.** Gaps *between* cards are
   `SPLIT_HANDLE_THICKNESS_PX` (the handle's own footprint); the gap at the
   window edge is `SHELL_GUTTER_PX`. They are equal on purpose.
3. **Cards do not nest.** A card inside a card is the "Russian doll" look that
   makes dense UIs noisy. Where a column holds a *list* of cards — the
   Properties column, and the Fields column with its brand header and Data
   Source card above the panel — the column itself is a **well**
   (`--df-surface-shell`, the same colour as the canvas) rather than a card.

   The corollary: **an independently collapsible section in a well is a card.**
   That is what the four Properties sections are, and it is why Data Source was
   split out of the Fields card — it keeps its own expand state, so the canvas
   gap separates it now instead of the surface tint and hairline it used to
   draw. A divider *inside* a card (the Fields header above its list) stays a
   divider; the rule is about siblings in a well, not regions of one surface.

   **A well is never padded.** Its own gutter would sit *inside* the handle that
   already separates the columns, so its cards would inset 8px from their
   neighbours while every other gap stays 4px, and their top edges would drop
   below the cards in the columns either side — the ragged top row that rule 2
   is there to prevent. A well supplies only the `gap` between its cards.

`SplitHandle` has a `variant` for the two situations this creates:

| variant | where | resting appearance |
|---|---|---|
| `gap` | between two panel cards | invisible — the canvas gap is the boundary |
| `divider` (default) | between regions of one card | a 1px line, as before |

So the shell's two handles use `gap`, while the legend and debug-drawer handles
inside the chart card keep `divider` — without a canvas gap behind them, a line
is the only thing that says "draggable".

Radius comes from `PANEL_RADIUS_PX` (6), deliberately *not* from
`theme.shape.borderRadius` (4): the theme's radius is pinned to 4 by the
Menu/Dialog/Popover overrides, and a panel is a bigger surface that carries a
little more curve. `--df-panel-radius` mirrors it for CSS modules.

A card must set `overflow: hidden`, or its own children (a branded header, a
scrollbar) will square off the corners it just rounded.

### Inside a card

Every collapsible card wears the same header: `Properties/SectionHeader`, which
owns the chevron, the 40px row and the hover tint. It is **full-bleed**, because
the tint has to reach the card's edges — so the 12px horizontal inset lives in
the header and the card's content has to supply a matching one of its own, or
the title and the controls under it will not share a left edge.

That inset is `--df-section-inset` (12px), and its top edge doubles as the gap
between the header and the first control. Like `--df-panel-radius` it is
geometry rather than colour, and rides in the token layer for the same reason:
CSS modules need to read it, and this is the one place both views are generated
from. `tokens.test.ts` lists both in `NON_COLOR_TOKENS` and `SCHEME_INVARIANT`,
which is what exempts them from the "every token differs between light and
dark" rule.

## Guardrails

Two halves of one contract, both enforced in CI:

1. **`.ts` / `.tsx`** — `no-restricted-syntax` rules in `package.json`
   `eslintConfig` reject hex and `rgb()`/`hsl()` literals, in both plain strings
   and template literals. Gated by the `Lint frontend` step in
   `.github/workflows/test.yml`.
2. **`.css`** — `src/theme/cssColorBudget.test.ts` holds a per-file budget in
   `cssColorBudget.json` and fails if any file goes **over** it (new literals)
   *or* sits **under** it (a stale budget). Runs in the normal test step.
   stylelint was deliberately rejected: ~40 transitive packages plus a second
   config and ignore list, to lint 34 files.

### The two progress bars

Neither guardrail blocks on the ~1000 literals that already exist, and both
double as a progress bar:

- the `no-restricted-syntax: off` override list in `package.json` — **it only
  shrinks.** Each migration slice deletes its own entries in the same commit.
  Never add to it.
- `cssColorBudget.json` — each slice lowers the numbers it touched. Regenerate
  with:

  ```
  UPDATE_COLOR_BUDGET=1 CI=true npx react-scripts test --watchAll=false --testPathPattern cssColorBudget
  ```

Permanent exemptions, not backlog:

- **`src/config/colorSchemes.ts`** — data-visualization palettes. A theme flips
  surfaces; it does not get to redefine what "category 3" looks like. Themeing
  these would break comparability across sheets and screenshots.
- **The `src/theme/` directory** — where tokens are defined.
- **Tests** — fixtures legitimately assert on concrete colors.

Escape hatch for a color that genuinely cannot be a token: `/* color-literal-ok:
<reason> */` on the line (CSS), which the budget counter skips.

## Things that are deliberately not themed

- **Data-viz palettes** — see above.
- **The inverted tooltips.** `CustomTooltip.css` and the `.plot-tip` rules in
  `index.css` are a dark slab on a light UI *by design*. They get
  `--df-inverse-*` tokens whose light and dark values are identical, so they
  stay dark in both themes. A naive sweep would map them onto surface tokens and
  invert them to white-on-white in dark mode.
- **`App.css`'s global element selectors** (`label`, `input`, `select`, `button`,
  `table`, `th`, `td`). These are the *only* thing styling the data source page
  and its seven connector forms, which use no MUI at all. Tokenize them in
  place; scoping or retiring them is a separate change, because doing it at the
  same time as a color change makes any regression un-bisectable.

## Traps worth knowing

- **`App.css` has three `:not([class*="toggleActive"])` guards** that are coupled
  to a CSS-module *local class name* (`FieldsPanel_toggleActive__hash`).
  Renaming `.toggleActive` silently re-enables a blue button hover over the
  green active-toggle state. Rename only if all three guards move in the same
  commit.
- **Preserve `!important` verbatim** when swapping a literal for a token
  (`FieldChip.module.css`, `.plot-tip`, `App.css .compact-tabs` all rely on it).
  Never combine a token swap with specificity surgery in one commit.
- **Do not put `fill` on the `svg text` rule** in `index.css`. A CSS `fill`
  declaration beats an SVG presentation attribute and would override every
  intentional per-mark label color. Chart text follows the ambient `color`
  property via Observable Plot's `fill="currentColor"` instead.
- **Observable Plot rejects `var()` for opacities** — `maybeNumberChannel` reads
  it as a column name. Scheme-dependent opacities are numbers from the
  TypeScript side, not CSS variables.
