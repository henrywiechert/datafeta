// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { sanitizeLinkHref } from './linkColumnUrl';

describe('sanitizeLinkHref', () => {
  it('accepts absolute http and https URLs', () => {
    expect(sanitizeLinkHref('https://ncm.corp/cell/4711')).toBe('https://ncm.corp/cell/4711');
    expect(sanitizeLinkHref('http://ncm.corp/cell/4711')).toBe('http://ncm.corp/cell/4711');
  });

  it('preserves query strings and fragments', () => {
    const url = 'https://grafana/d/abc?var-cell=4711&from=now-6h#panel-2';
    expect(sanitizeLinkHref(url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeLinkHref('  https://ncm.corp/x  ')).toBe('https://ncm.corp/x');
  });

  it('rejects javascript: and data: schemes', () => {
    /* eslint-disable no-script-url */
    expect(sanitizeLinkHref('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeLinkHref('JaVaScRiPt:alert(1)')).toBeUndefined();
    /* eslint-enable no-script-url */
    expect(sanitizeLinkHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(sanitizeLinkHref('vbscript:msgbox(1)')).toBeUndefined();
  });

  it('rejects other non-http schemes', () => {
    expect(sanitizeLinkHref('file:///etc/passwd')).toBeUndefined();
    expect(sanitizeLinkHref('ftp://host/x')).toBeUndefined();
  });

  it('rejects relative and malformed values', () => {
    expect(sanitizeLinkHref('/cell/4711')).toBeUndefined();
    expect(sanitizeLinkHref('ncm.corp/cell/4711')).toBeUndefined();
    expect(sanitizeLinkHref('not a url')).toBeUndefined();
    expect(sanitizeLinkHref('')).toBeUndefined();
    expect(sanitizeLinkHref('   ')).toBeUndefined();
  });

  it('rejects non-string values', () => {
    expect(sanitizeLinkHref(undefined)).toBeUndefined();
    expect(sanitizeLinkHref(null)).toBeUndefined();
    expect(sanitizeLinkHref(42)).toBeUndefined();
    expect(sanitizeLinkHref({ href: 'https://x' })).toBeUndefined();
  });
});
