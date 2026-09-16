// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeRoot from './ThemeRoot';
import ThemeModeToggle from './ThemeModeToggle';

const MODE_STORAGE_KEY = 'dataslicer.themeMode';
const SCHEME_ATTRIBUTE = 'data-df-color-scheme';

const renderToggle = () => render(<ThemeRoot><ThemeModeToggle /></ThemeRoot>);

describe('ThemeModeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(SCHEME_ATTRIBUTE);
  });

  it('cycles system -> light -> dark -> system', () => {
    renderToggle();

    // matchMedia is stubbed to report light, so "system" resolves to light.
    expect(screen.getByLabelText('Theme: follow system')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Theme: light')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Theme: dark')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Theme: follow system')).toBeInTheDocument();
  });

  it('flips the attribute the token layer keys its dark block on', () => {
    renderToggle();

    fireEvent.click(screen.getByRole('button')); // light
    fireEvent.click(screen.getByRole('button')); // dark
    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('dark');

    fireEvent.click(screen.getByRole('button')); // system -> light, per the stub
    expect(document.documentElement.getAttribute(SCHEME_ATTRIBUTE)).toBe('light');
  });

  it('persists the choice under the app-prefixed key', () => {
    renderToggle();

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));

    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('dark');
  });
});

describe('the pre-paint script in public/index.html', () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'public', 'index.html'),
    'utf8',
  );

  /**
   * The script runs before React and must agree with ThemeRoot on both the
   * storage key and the attribute name. Nothing else connects them, and a
   * mismatch is invisible except as a flash of the wrong theme on reload.
   */
  it('reads the same storage key ThemeRoot writes', () => {
    expect(html).toContain(MODE_STORAGE_KEY);
    const themeRoot = fs.readFileSync(path.resolve(__dirname, 'ThemeRoot.tsx'), 'utf8');
    expect(themeRoot).toContain(`modeStorageKey="${MODE_STORAGE_KEY}"`);
  });

  it('sets the same attribute the generated CSS keys its dark block on', () => {
    expect(html).toContain(SCHEME_ATTRIBUTE);
    const generated = fs.readFileSync(path.resolve(__dirname, 'tokens.generated.css'), 'utf8');
    expect(generated).toContain(`[${SCHEME_ATTRIBUTE}="dark"] {`);
    const themeRoot = fs.readFileSync(path.resolve(__dirname, 'ThemeRoot.tsx'), 'utf8');
    expect(themeRoot).toContain(`attribute="${SCHEME_ATTRIBUTE}"`);
  });

  it('resolves the system preference itself, rather than waiting for React', () => {
    expect(html).toContain('prefers-color-scheme: dark');
  });
});
