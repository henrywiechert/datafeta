// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeRoot from './ThemeRoot';
import ThemeModeToggle from './ThemeModeToggle';
import denseTheme from './index';
import { COLOR_SCHEMES } from './tokens.def';

const MODE_STORAGE_KEY = 'dataslicer.themeMode';
const SCHEME_STORAGE_KEY = 'dataslicer.themeScheme';
const SCHEME_ATTRIBUTE = 'data-df-color-scheme';

const renderToggle = () => render(<ThemeRoot><ThemeModeToggle /></ThemeRoot>);

/** Opens the menu and picks an entry by its visible label. */
const pick = (label: string) => {
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
};

describe('ThemeModeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(SCHEME_ATTRIBUTE);
  });

  it('offers one entry per scheme, plus follow-system', () => {
    renderToggle();
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent))
      .toEqual(['Follow system', 'Light', 'Dark', 'Dim']);
  });

  it('starts on follow-system, which the matchMedia stub resolves to light', () => {
    renderToggle();
    expect(screen.getByLabelText('Theme: follow system')).toBeInTheDocument();
    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('light');
  });

  it('flips the attribute the token layer keys its blocks on', () => {
    renderToggle();

    pick('Dark');
    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('dark');
    expect(screen.getByLabelText('Theme: dark')).toBeInTheDocument();

    pick('Light');
    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('light');
  });

  it('selects the dim scheme without leaving dark mode', () => {
    // The two dark entries differ only in scheme, so the mode has to stay
    // 'dark' while the attribute follows the variant.
    renderToggle();

    pick('Dim');

    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('dim');
    expect(screen.getByLabelText('Theme: dim')).toBeInTheDocument();
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('dark');
    expect(localStorage.getItem(`${SCHEME_STORAGE_KEY}-dark`)).toBe('dim');
  });

  it('goes back to plain dark from dim', () => {
    renderToggle();

    pick('Dim');
    pick('Dark');

    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('dark');
    expect(localStorage.getItem(`${SCHEME_STORAGE_KEY}-dark`)).toBe('dark');
  });

  it('persists the choice under the app-prefixed keys', () => {
    renderToggle();

    pick('Dark');

    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('dark');
  });

  it('has a menu entry for every scheme the theme defines', () => {
    // The menu labels and icons are hand-authored, so a scheme added to
    // tokens.def.json would otherwise be unreachable from the UI.
    renderToggle();
    fireEvent.click(screen.getByRole('button'));
    const entries = screen.getAllByRole('menuitem').length;

    expect(entries).toBe(COLOR_SCHEMES.length + 1); // + follow-system
    expect(Object.keys(denseTheme.colorSchemes).sort()).toEqual([...COLOR_SCHEMES].sort());
  });
});

describe('the pre-paint script in public/index.html', () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'public', 'index.html'),
    'utf8',
  );

  /**
   * The script runs before React and must agree with ThemeRoot on both storage
   * keys and the attribute name. Nothing else connects them, and a mismatch is
   * invisible except as a flash of the wrong theme on reload.
   */
  it('reads the same storage keys ThemeRoot writes', () => {
    const themeRoot = fs.readFileSync(path.resolve(__dirname, 'ThemeRoot.tsx'), 'utf8');

    expect(html).toContain(MODE_STORAGE_KEY);
    expect(themeRoot).toContain(`modeStorageKey="${MODE_STORAGE_KEY}"`);

    // MUI suffixes the scheme key with the mode, which is how one mode can have
    // several schemes. The script has to read the same composed key.
    expect(html).toContain(`${SCHEME_STORAGE_KEY}-`);
    expect(themeRoot).toContain(`colorSchemeStorageKey="${SCHEME_STORAGE_KEY}"`);
  });

  it('sets the same attribute the generated CSS keys its scheme blocks on', () => {
    expect(html).toContain(SCHEME_ATTRIBUTE);
    const generated = fs.readFileSync(path.resolve(__dirname, 'tokens.generated.css'), 'utf8');
    for (const scheme of COLOR_SCHEMES.filter((s) => s !== 'light')) {
      expect(generated).toContain(`[${SCHEME_ATTRIBUTE}="${scheme}"] {`);
    }
    const themeRoot = fs.readFileSync(path.resolve(__dirname, 'ThemeRoot.tsx'), 'utf8');
    expect(themeRoot).toContain(`attribute="${SCHEME_ATTRIBUTE}"`);
  });

  it('resolves the system preference itself, rather than waiting for React', () => {
    expect(html).toContain('prefers-color-scheme: dark');
  });
});
