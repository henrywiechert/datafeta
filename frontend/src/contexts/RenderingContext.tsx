import React, { createContext, useContext, ReactNode } from 'react';
import { useRenderingCoordinator } from '../hooks/useRenderingCoordinator';

interface RenderingContextType {
  registerPlot: (plotId: string) => void;
  markPlotRendered: (plotId: string) => void;
  startRenderingBatch: (plotIds: string[], onAllRendered: () => void, timeout?: number) => void;
  cancelRenderingBatch: () => void;
  getRenderingState: () => { pendingPlots: number; isRendering: boolean };
}

const RenderingContext = createContext<RenderingContextType | undefined>(undefined);

export function RenderingProvider({ children }: { children: ReactNode }) {
  const coordinator = useRenderingCoordinator();

  return (
    <RenderingContext.Provider value={coordinator}>
      {children}
    </RenderingContext.Provider>
  );
}

export function useRendering() {
  const context = useContext(RenderingContext);
  if (!context) {
    throw new Error('useRendering must be used within a RenderingProvider');
  }
  return context;
}

