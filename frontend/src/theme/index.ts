// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Compact / engineering-density MUI theme.
 *
 * Scoped to transient chrome (menus, dialogs) that felt oversized under
 * Material defaults. Leaves carefully tuned panels (chips, overrides, palette)
 * alone — those use local sx/CSS already.
 *
 * Built with `experimental_extendTheme` rather than `createTheme` so the
 * palette is emitted as CSS custom properties (`--mui-palette-*`), which the
 * app's 30 CSS modules can read — `createTheme`'s palette is a JS object that
 * only `sx` can see. This is not a styling change: `extendTheme` derives its
 * light scheme from the same `createTheme` code path, so all 60 palette leaves
 * are byte-identical to the defaults the app renders today. It additionally
 * emits the component namespaces (Alert, Button, Switch, …) and `*Channel`
 * values that let MUI internals composite alpha via `var()` instead of
 * `alpha()`. `src/theme/palette.test.ts` locks that equivalence.
 *
 * Deliberately NO *light* `palette` block: the app's own semantic colors belong
 * in the `--df-*` token layer, not in MUI's namespace. See `THEMING.md`. The two
 * dark overrides are documented at the `colorSchemes` block below.
 */
import { experimental_extendTheme as extendTheme, createTheme } from '@mui/material/styles';

/**
 * The `dim` scheme's MUI palette.
 *
 * Built with `createTheme` first, then handed over as a finished palette,
 * because `extendTheme` only augments `light` and `dark`: it iterates every
 * scheme but runs just those two through palette augmentation, so a custom
 * scheme passed as a bare palette throws
 * `Cannot read properties of undefined (reading 'background')` from its own
 * `setColor` — `palette.common` was never built. Routing through `createTheme`
 * produces the `*Channel` values, `contrastText`, and the component namespaces
 * (Alert, Switch, …) that the rest of the theme expects.
 *
 * Only the leaves that give the scheme its character are set; `mode: 'dark'`
 * makes MUI derive the rest from its dark defaults, so `primary.main` and
 * friends stay shared with `dark`.
 *
 * `background.paper` matters more here than it looks: it is what Menu, Dialog
 * and Popover paint with. Stock dark leaves it at `#121212` — darker than the
 * panels it opens over — so a lifted scheme has to lift it too, or every menu
 * reads as a hole punched in the card. (The `dark` scheme still has that
 * mismatch; fixing it is a separate change with its own screenshot.)
 */
const dimPalette = createTheme({
  palette: {
    mode: 'dark',
    background: {
      // --df-surface-shell and --df-surface-raised. Kept in step by hand: MUI
      // cannot read the --df-* layer, which is the whole reason both exist.
      default: '#151a23',
      paper: '#242d3b',
    },
    // A step softer than `dark`'s #e8eaed, and cooled to match the surfaces.
    text: { primary: '#dfe3ea' },
    action: { active: 'rgba(255, 255, 255, 0.7)' },
  },
}).palette;

/**
 * The `solarized` scheme's MUI palette — Ethan Schoonover's Solarized Light.
 *
 * Same `createTheme` pre-augmentation as `dimPalette`, and the same reason.
 * Unlike `dim`, this one carries its own hues: Solarized is recognisable for
 * its blue and its cream, and a Solarized scheme wearing Material's #1976d2
 * would just be a beige light theme. So `primary` and the four status roles are
 * the Solarized accents, and `createTheme` derives their light/dark/contrastText
 * ramps — which is what the `--df-*` fallbacks for those roles are generated
 * from. See THEMING.md.
 *
 * `overlays` is assigned below the theme, not here: see the note there.
 */
const solarizedPalette = createTheme({
  palette: {
    mode: 'light',
    // base3 is reserved for the chart paper — the surface data is drawn on,
    // which is what it is in Solarized proper (the editor background). The UI
    // chrome sits below it: base2 for panels, an interpolated step above for
    // cards, and below base2 for the canvas. See THEMING.md on inventing
    // inside a ramp rather than past its lightest end.
    background: {
      default: '#e7e0ca',
      paper: '#f5efdc',
    },
    // base01 emphasized / base00 body / base1 secondary.
    text: {
      primary: '#586e75',
      secondary: '#657b83',
      disabled: '#93a1a1',
    },
    // `dark` shades are named rather than derived: MUI's darken() returns an
    // `rgb()` string, and these values are copied into the token fallbacks by
    // hand, where a hex keeps the generated CSS readable. Same colours either
    // way — they are exactly what augmentColor would have computed.
    /*
     * Seeded because `extendTheme` decides these by scheme *name*, not palette
     * mode: `key === 'light' ? ['#fff', '#000'] : ['#000', '#fff']`. Any custom
     * scheme therefore gets the dark pair — and `common.onBackgroundChannel` is
     * what MUI composites the resting border of OutlinedInput, the underline of
     * Input, the fill of FilledInput, and the dividers of ButtonGroup and
     * PaginationItem from. Left alone, every one of those renders
     * `rgba(255 255 255 / 0.23)` on cream: invisible until focused, which is
     * precisely how the bug showed up. `setColor` only assigns when the key is
     * absent, so naming them here is enough.
     */
    common: { background: '#fff', onBackground: '#000' },
    primary: { main: '#268bd2', dark: '#1a6193' },
    error: { main: '#dc322f', dark: '#9a2320' },
    warning: { main: '#cb4b16', dark: '#8e340f' },
    success: { main: '#859900' },
    info: { main: '#2aa198' },
  },
}).palette;

const denseTheme = extendTheme({
  colorSchemes: {
    /**
     * The two palette values the app overrides, and the reason they have to be
     * here rather than in the token layer.
     *
     * Both are leaves MUI's dark scheme puts at pure `#fff`, and between them
     * they cover everything that names no colour of its own.
     *
     * MUI's stock dark `text.primary` is pure `#fff`. Two things read it: the
     * `html, body` rule in index.css (via `--df-text-primary`, since there is no
     * CssBaseline) and every MUI `Typography`, whose default `color` is
     * `inherit`. So *any* text that does not name a role rendered at maximum
     * white, while text that does name one — `--df-text-secondary` on the
     * FieldsPanel category headers, say — sat at 70% and looked calm. Light mode
     * hid the split: unstyled text was `rgba(0,0,0,0.87)` against `#333`/`#666`
     * tokens, three shades of "dark grey". Dark mode put the un-roled half at
     * the glaring top of the ramp.
     *
     * Softening the top of the ramp is therefore a one-line fix for the whole
     * app, and it belongs in the MUI layer precisely because MUI's own default
     * is what every un-roled string inherits — a `--df-*` token cannot reach
     * text that names no token. Assigning explicit roles to that text is the
     * separate, larger pass; this makes the default tolerable in the meantime.
     *
     * Light is untouched: `palette.test.ts` locks every light leaf to
     * `createTheme`'s value, and a dark-only override does not disturb it.
     */
    dark: {
      palette: {
        text: {
          primary: '#e8eaed',
        },
        /**
         * The icon half of the same problem. `action.active` is what an
         * `IconButton` paints with when it is given no colour — `color="default"`
         * or nothing at all, which is ~48 of the app's 79 IconButtons, plus the
         * unselected branch of every `color={on ? 'primary' : 'default'}` toggle
         * — and MUI's dark value for it is pure `#fff`.
         *
         * In light mode this is invisible: `rgba(0,0,0,0.54)` sits right next to
         * `text.secondary`'s `0.6`, so a default icon and a `text.secondary` one
         * weigh the same. In dark they were `#fff` against `0.7`, which is why
         * the left half of the chart-config toolbar (terminal, fullscreen,
         * table, title, swap — all `color="default"`) glared next to the right
         * half (refresh, settings, axis links — all explicit `text.secondary`).
         *
         * Matched to `text.secondary` rather than split the difference: an icon
         * and its label should carry the same weight, and it makes the toolbar
         * read as one row instead of two groups.
         */
        action: {
          active: 'rgba(255, 255, 255, 0.7)',
        },
      },
    },
    /**
     * The soft / lifted dark variant. Its palette is built above; see
     * THEMING.md for how a variant scheme is defined in the token layer.
     */
    dim: {
      palette: dimPalette,
    },
    /** Solarized Light. Built above; a patch over `light` in the token layer. */
    solarized: {
      palette: solarizedPalette,
    },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiMenu: {
      defaultProps: {
        MenuListProps: { dense: true },
      },
      styleOverrides: {
        paper: {
          borderRadius: 4,
        },
        list: {
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    },
    MuiMenuItem: {
      defaultProps: {
        dense: true,
      },
      styleOverrides: {
        root: {
          fontSize: '0.75rem',
          minHeight: 28,
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 10,
          paddingRight: 10,
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 28,
          '& .MuiSvgIcon-root': {
            fontSize: 18,
          },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        root: {
          marginTop: 0,
          marginBottom: 0,
        },
        primary: {
          fontSize: '0.75rem',
        },
        secondary: {
          fontSize: '0.7rem',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 4,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          fontWeight: 600,
          padding: '10px 14px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '10px 14px',
          fontSize: '0.8125rem',
          // MUI adds extra top padding when DialogContent follows DialogTitle
          '&.MuiDialogContent-root': {
            paddingTop: 10,
          },
        },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '8px 12px',
          gap: 4,
          '& .MuiButton-root': {
            textTransform: 'none',
            fontSize: '0.75rem',
          },
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 4,
        },
      },
    },
  },
});

/*
 * `overlays` is the dark elevation tint MUI's Paper paints on top of
 * `background.paper`, and `extendTheme` defaults it for `light` and `dark`
 * only — a custom scheme gets `undefined`, so elevated Papers would quietly
 * lose the tint. The array is a ladder of white alphas, independent of the
 * paper colour, so `dark`'s is exactly the one `dim` should have.
 */
denseTheme.colorSchemes.dim.overlays = denseTheme.colorSchemes.dark.overlays;
// `solarized` takes `light`'s, which is the empty list: the elevation tint is a
// dark-mode device. Assigned rather than written as `[]` in the block above
// because the type is a fixed 25-tuple.
denseTheme.colorSchemes.solarized.overlays = denseTheme.colorSchemes.light.overlays;

export default denseTheme;
