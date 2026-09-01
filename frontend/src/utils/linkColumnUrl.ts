// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Render-time validation for link-column values.
 *
 * Link URLs are produced by the database (via a virtual column's CONCAT
 * expression) and configurations are persisted and shared, so the value is
 * untrusted at render time — not just at authoring time. Every value is
 * validated on every render rather than once when the column is defined.
 */

/** URL schemes permitted for link columns. Everything else is rendered as plain text. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validate a link-column cell value and return it as a safe href.
 *
 * Returns `undefined` when the value is absent, is not a well-formed absolute
 * URL, or uses a scheme outside {@link ALLOWED_PROTOCOLS} (notably `javascript:`
 * and `data:`). Callers render plain text in that case — a link column with a
 * malformed value degrades, it never throws and never emits an unsafe href.
 */
export function sanitizeLinkHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    // Absolute URLs only: no base is supplied, so relative values are rejected.
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return undefined;

  return parsed.href;
}
