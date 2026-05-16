// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useContext } from 'react';
import { VisualizationContext, VisualizationContextType } from './VisualizationProvider';

/**
 * Custom hook to use the VisualizationContext.
 * Must be used within a VisualizationProvider.
 */
export function useVisualizationContext(): VisualizationContextType {
  const context = useContext(VisualizationContext);
  if (context === undefined) {
    throw new Error('useVisualizationContext must be used within a VisualizationProvider');
  }
  return context;
}

