// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, FilterConfig, FilterMetadata } from '../types';

export function mergeFilterFields(sessionFields: Field[], localFields: Field[]): Field[] {
  const sessionIds = new Set(sessionFields.map((field) => field.id));
  const localOnly = localFields.filter((field) => !sessionIds.has(field.id));
  return [...sessionFields, ...localOnly];
}

export function mergeFilterConfigurations(
  localConfigurations: Record<string, FilterConfig>,
  sessionConfigurations: Record<string, FilterConfig>,
): Record<string, FilterConfig> {
  const sessionIds = new Set(Object.keys(sessionConfigurations));
  const localOnly: Record<string, FilterConfig> = {};

  for (const [id, config] of Object.entries(localConfigurations)) {
    if (!sessionIds.has(id)) {
      localOnly[id] = config;
    }
  }

  return {
    ...localOnly,
    ...sessionConfigurations,
  };
}

export function mergeFilterMetadata(
  localMetadata: Record<string, FilterMetadata>,
  sessionMetadata: Record<string, FilterMetadata>,
): Record<string, FilterMetadata> {
  return {
    ...localMetadata,
    ...sessionMetadata,
  };
}

export function removeDisabledFilterConfigurations(
  configurations: Record<string, FilterConfig>,
  disabledFilterIds?: string[],
): Record<string, FilterConfig> {
  if (!disabledFilterIds || disabledFilterIds.length === 0) {
    return configurations;
  }

  const result = { ...configurations };
  disabledFilterIds.forEach((id) => delete result[id]);
  return result;
}

export function buildEffectiveFilterConfigurations(args: {
  localConfigurations: Record<string, FilterConfig>;
  sessionConfigurations: Record<string, FilterConfig>;
  disabledFilterIds?: string[];
}): Record<string, FilterConfig> {
  return removeDisabledFilterConfigurations(
    mergeFilterConfigurations(args.localConfigurations, args.sessionConfigurations),
    args.disabledFilterIds,
  );
}
