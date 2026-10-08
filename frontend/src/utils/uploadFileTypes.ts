// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * File types accepted by the upload inputs. Data file formats come from the
 * backend's handler registry (AppConfig.fileFormats); these helpers only add
 * the compression wrappers, which the server decompresses (e.g.
 * `sales.csv.gz`, or a `.zip` of several files).
 */
import type { FileFormatInfo, FileFormatOption } from '../services/api/appConfigApi';

export const COMPRESSION_EXTENSIONS = ['.gz', '.gzip', '.bz2', '.xz', '.zst', '.zip'];

const SQLITE_FILE_EXTENSIONS = ['.sqlite', '.sqlite3', '.db'];

// `accept` only matches the last extension, so `.gz` stands in for `.csv.gz` etc.
export const SQLITE_FILE_ACCEPT = [...SQLITE_FILE_EXTENSIONS, ...COMPRESSION_EXTENSIONS].join(',');

/** `accept` attribute for data file inputs. */
export function dataFileAccept(formats: FileFormatInfo[]): string {
  const extensions = formats.reduce<string[]>((all, format) => all.concat(format.extensions), []);
  return [...extensions, ...COMPRESSION_EXTENSIONS].join(',');
}

/** Human list of the format labels, e.g. "CSV, Parquet, JSON or Excel". */
export function formatLabelList(formats: FileFormatInfo[], conjunction = 'or'): string {
  const labels = formats.map((format) => format.label);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels[labels.length - 1]}`;
}

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

/** The registered format of a (possibly compressed) file, if any. */
export function fileFormatFor(filename: string, formats: FileFormatInfo[]): FileFormatInfo | undefined {
  const inner = stripCompressionSuffix(filename);
  return formats.find((format) => format.extensions.some((ext) => inner.endsWith(ext)));
}

/**
 * Whether the selection may honour a parsing option group. A zip may hold any
 * format, so it counts for every option.
 */
export function selectionUsesOption(
  files: File[],
  formats: FileFormatInfo[],
  option: FileFormatOption,
): boolean {
  return files.some((file) => (
    isZipArchive(file.name) || Boolean(fileFormatFor(file.name, formats)?.options.includes(option))
  ));
}

/**
 * Whether files must be staged before connecting so the user can pick parts
 * (e.g. workbook sheets). A zip may contain multi-part files, which only the
 * server can tell.
 */
export function needsStaging(files: File[], formats: FileFormatInfo[]): boolean {
  return files.some((file) => isZipArchive(file.name) || Boolean(fileFormatFor(file.name, formats)?.partLabel));
}
