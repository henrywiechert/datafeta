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
