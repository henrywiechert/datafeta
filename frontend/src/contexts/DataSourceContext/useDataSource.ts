// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useContext } from 'react';
import { DataSourceContext, DataSourceContextType } from './DataSourceProvider';

// Unified facade hook — preserved for backward compatibility. Existing
// ~30 consumers continue to use this. New code should prefer the focused
// slice hooks in ./hooks.ts.
export function useDataSource(): DataSourceContextType {
  const context = useContext(DataSourceContext);
  if (context === undefined) {
    throw new Error('useDataSource must be used within a DataSourceProvider');
  }
  return context;
}
