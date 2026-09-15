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
 * Deliberately NO `palette` block: the app's own semantic colors belong in the
 * `--df-*` token layer, not in MUI's namespace. See `THEMING.md`.
 */
import { experimental_extendTheme as extendTheme } from '@mui/material/styles';

const denseTheme = extendTheme({
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
