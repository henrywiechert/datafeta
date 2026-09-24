// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * File types accepted by the upload inputs. Compressed variants (e.g.
 * `sales.csv.gz`, or a `.zip` of several files) are decompressed server-side.
 */

export const COMPRESSION_EXTENSIONS = ['.gz', '.gzip', '.bz2', '.xz', '.zst', '.zip'];

const DATA_FILE_EXTENSIONS = ['.csv', '.parquet', '.json', '.ndjson', '.jsonl'];
const SQLITE_FILE_EXTENSIONS = ['.sqlite', '.sqlite3', '.db'];

// `accept` only matches the last extension, so `.gz` stands in for `.csv.gz` etc.
export const DATA_FILE_ACCEPT = [...DATA_FILE_EXTENSIONS, ...COMPRESSION_EXTENSIONS].join(',');
export const SQLITE_FILE_ACCEPT = [...SQLITE_FILE_EXTENSIONS, ...COMPRESSION_EXTENSIONS].join(',');

/** Lowercased filename without a trailing compression extension (`a.csv.gz` → `a.csv`). */
export function stripCompressionSuffix(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = COMPRESSION_EXTENSIONS.find((e) => lower.endsWith(e));
  return ext ? lower.slice(0, -ext.length) : lower;
}

/** A zip archive's contents are unknown until the server opens it. */
export function isZipArchive(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip');
}
