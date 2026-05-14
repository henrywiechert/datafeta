// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Hook for getting field display names with alias lookup from context.
 * 
 * This hook provides a function that returns the display name for a field,
 * looking up any user-defined alias from the DataSourceContext.
 * 
 * Usage:
 *   const getDisplayName = useFieldDisplayName();
 *   const name = getDisplayName(field);
 */

import { useCallback } from 'react';
import { Field } from '../types';
import { useDataSource } from '../contexts/DataSourceContext';
import { getFieldDisplayName } from '../utils/fieldUtils';

/**
 * Returns a function that gets the display name for a field,
 * automatically looking up aliases from the DataSourceContext.
 */
export function useFieldDisplayName(): (field: Field) => string {
  const { dataSource } = useDataSource();
  const aliasLookup = dataSource.fieldDisplayAliases;
  
  return useCallback(
    (field: Field) => getFieldDisplayName(field, aliasLookup),
    [aliasLookup]
  );
}

/**
 * Returns the alias lookup map directly, for components that need
 * to pass it to non-hook code (e.g., chart generation).
 */
export function useFieldAliasLookup(): Record<string, string> {
  const { dataSource } = useDataSource();
  return dataSource.fieldDisplayAliases;
}
