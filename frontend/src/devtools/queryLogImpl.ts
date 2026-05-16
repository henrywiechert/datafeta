// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Dev-only SQL query logger implementation.
 *
 * - Stores a bounded in-memory log of local/remote SQL queries.
 * - Provides a simple subscription mechanism for a UI viewer.
 * - Includes a lightweight SQL pretty-printer (no extra deps).
 */

import type { SqlQueryLogEvent } from './queryLog';

export type SqlQueryLogEntry = SqlQueryLogEvent & {
  id: string;
  ts: number;
};

const MAX_ENTRIES = 300;

let seq = 0;
let entries: SqlQueryLogEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function subscribeSqlLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSqlLogEntries(): SqlQueryLogEntry[] {
  return entries;
}

export function clearSqlLog(): void {
  entries = [];
  notify();
}

export function formatSql(sql: string): string {
  // Lightweight formatter:
  // - normalize whitespace
  // - newline before major clauses
  // - simple indentation for JOIN/ON/AND
  const s = String(sql || '').trim();
  if (!s) return s;

  // Collapse whitespace first (keeps string literals intact poorly, but acceptable for dev viewing).
  let out = s.replace(/\s+/g, ' ');

  const breakBefore = [
    'SELECT',
    'FROM',
    'WHERE',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'UNION ALL',
    'UNION',
  ];

  // Handle multi-word tokens first.
  for (const kw of breakBefore.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'ig');
    out = out.replace(re, `\n${kw}`);
  }

  // Newlines before join-like clauses.
  out = out.replace(/\b(LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|INNER\s+JOIN|JOIN)\b/gi, '\n$1');
  out = out.replace(/\bON\b/gi, '\n  ON');
  out = out.replace(/\bAND\b/gi, '\n   AND');
  out = out.replace(/\bOR\b/gi, '\n   OR');

  // Clean multiple newlines.
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export function logSqlQueryImpl(event: SqlQueryLogEvent): void {
  const entry: SqlQueryLogEntry = {
    ...event,
    id: `${Date.now()}_${seq++}`,
    ts: Date.now(),
  };

  entries = [...entries, entry];
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  // Also mirror to browser console for quick copy/paste during dev.
  // (The in-app viewer is the primary UI.)
  try {
    const tag = entry.origin === 'local' ? '[SQL local]' : '[SQL remote]';
    // eslint-disable-next-line no-console
    console.debug(tag, entry.label || '', entry.sql);
  } catch {
    // ignore
  }

  notify();
}


