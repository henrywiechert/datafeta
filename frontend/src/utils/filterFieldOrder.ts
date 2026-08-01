// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../types';

/**
 * Keeps the filter chip order stable when a field moves between sheet and
 * session scope. The merged list always puts session fields first, so without
 * this a scope toggle would make the chip jump to the top (or to the end).
 *
 * Fields keep the position they had in `previousOrder`; unseen fields keep
 * their merged relative order and are appended.
 */
export function stabilizeFilterFieldOrder(fields: Field[], previousOrder: string[]): Field[] {
  if (previousOrder.length === 0) {
    return fields;
  }

  const rank = new Map(previousOrder.map((id, index) => [id, index]));
  return [...fields].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
