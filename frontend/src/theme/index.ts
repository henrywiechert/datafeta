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
 * in the `--df-*` token layer, not in MUI's namespace. See `THEMING.md`. The one
 * dark override is documented at the `colorSchemes` block below.
 */
import { experimental_extendTheme as extendTheme } from '@mui/material/styles';

const denseTheme = extendTheme({
  colorSchemes: {
    /**
     * The single palette value the app overrides, and the reason it has to be
     * here rather than in the token layer.
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
      },
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

export default denseTheme;
