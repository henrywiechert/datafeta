/**
 * Dev-only SQL query logger (shim).
 *
 * Goal: allow production builds to exclude the heavy viewer + store implementation.
 * In production this module is a tiny no-op. In development it lazy-loads the impl
 * the first time it is used.
 */

export type SqlQueryOrigin = 'remote' | 'local';

export type SqlQueryLogEvent = {
  origin: SqlQueryOrigin;
  sql: string;
  /** Optional label shown in the UI list */
  label?: string;
  /** Useful metadata for correlating queries */
  meta?: Record<string, any>;
  /** Timing info (ms) */
  durationMs?: number;
};

type ImplModule = typeof import('./queryLogImpl');

let implPromise: Promise<ImplModule> | null = null;

async function getImpl(): Promise<ImplModule | null> {
  // CRA replaces NODE_ENV at build time; this keeps impl out of prod bundles.
  if (process.env.NODE_ENV === 'production') return null;
  if (!implPromise) {
    implPromise = import('./queryLogImpl');
  }
  return implPromise;
}

export function logSqlQuery(event: SqlQueryLogEvent): void {
  if (process.env.NODE_ENV === 'production') return;
  // Fire-and-forget; logging must never break app behavior.
  void getImpl()
    .then((m) => m?.logSqlQueryImpl(event))
    .catch(() => {});
}


