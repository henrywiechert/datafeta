// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only

export const filterValueKey = (value: unknown): string => {
  if (value === null || value === undefined) return '__NULL__';

  const stringValue = String(value);
  if (
    stringValue.length >= 19
    && stringValue[10] === 'T'
    && stringValue[4] === '-'
    && stringValue[13] === ':'
  ) {
    return stringValue.replace('T', ' ');
  }

  return stringValue;
};

export const deduplicateFilterValues = <T>(values: T[]): T[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = filterValueKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
