// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import type { Channels } from '../types/channels';
import type { Field } from '../types/field';

/**
 * Registry of the single-field encoding shelves (each holds one Field or null).
 *
 * Code that must treat "every encoding field" alike — query field collection,
 * cache hashes, schema validation, result remapping — iterates this list, so a
 * new single-field channel is registered here once instead of being added to
 * each of those lists by hand.
 *
 * - `key`: the flat key used in VisualizationState and the query/hash configs.
 * - `channel`: the matching entry in `Channels` (see `useChannels`).
 * - `scope`: `'mark'` encodings are drawn on marks and flow into the plot
 *   generator; `'pane'` encodings only style facet cells.
 *
 * Order is significant: it fixes the order of the cache-hash parts, so new
 * entries go at the end.
 */
export const ENCODING_FIELDS = [
  { key: 'colorField', channel: 'color', scope: 'mark' },
  { key: 'sizeField', channel: 'size', scope: 'mark' },
  { key: 'shapeField', channel: 'shape', scope: 'mark' },
  { key: 'facetBackgroundField', channel: 'facetBackground', scope: 'pane' },
  { key: 'lineStyleField', channel: 'lineStyle', scope: 'mark' },
] as const;

export type EncodingFieldKey = (typeof ENCODING_FIELDS)[number]['key'];

/** The single-field encodings as a flat, optional record. */
export type EncodingFields = { [K in EncodingFieldKey]?: Field | null };

export const ENCODING_FIELD_KEYS: readonly EncodingFieldKey[] = ENCODING_FIELDS.map((entry) => entry.key);

const MARK_ENCODING_FIELD_KEYS: readonly EncodingFieldKey[] = ENCODING_FIELDS
  .filter((entry) => entry.scope === 'mark')
  .map((entry) => entry.key);

/** Copy of the encoding fields with every key present (`undefined` → `null`). */
export function pickEncodingFields(source: EncodingFields): Required<EncodingFields> {
  const picked = {} as Required<EncodingFields>;
  for (const key of ENCODING_FIELD_KEYS) {
    picked[key] = source[key] ?? null;
  }
  return picked;
}

export function encodingFieldsFromChannels(channels: Channels): Required<EncodingFields> {
  const picked = {} as Required<EncodingFields>;
  for (const entry of ENCODING_FIELDS) {
    picked[entry.key] = channels[entry.channel].field;
  }
  return picked;
}

/** The assigned encoding fields with their keys, in registry order. */
export function listEncodingFieldEntries(
  source: EncodingFields,
): Array<{ key: EncodingFieldKey; field: Field }> {
  const entries: Array<{ key: EncodingFieldKey; field: Field }> = [];
  for (const key of ENCODING_FIELD_KEYS) {
    const field = source[key];
    if (field) entries.push({ key, field });
  }
  return entries;
}

/** The assigned encoding fields, in registry order. */
export function listEncodingFields(source: EncodingFields): Field[] {
  return listEncodingFieldEntries(source).map((entry) => entry.field);
}

/**
 * The assigned mark-scope encoding fields, in registry order. `replacements`
 * substitutes resolved variants (e.g. alias-enriched color/size) for the raw
 * ones in `source`.
 */
export function listMarkEncodingFields(
  source: EncodingFields,
  replacements: EncodingFields = {},
): Field[] {
  const fields: Field[] = [];
  for (const key of MARK_ENCODING_FIELD_KEYS) {
    const field = key in replacements ? replacements[key] : source[key];
    if (field) fields.push(field);
  }
  return fields;
}
