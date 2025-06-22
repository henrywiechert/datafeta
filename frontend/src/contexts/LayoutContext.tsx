import React, { createContext, useContext, ReactNode } from 'react';
import { useLayoutState, LayoutState, PanelConfig } from '../hooks/useLayoutState';

interface LayoutContextType {
  layoutState: LayoutState;
  togglePanel: (panelId: string) => void;
  collapsePanel: (panelId: string) => void;
  resizePanel: (panelId: string, width: number) => void;
  resetLayout: () => void;
  getVisiblePanels: () => PanelConfig[];
  getPanelsByPosition: (position: 'left' | 'right' | 'bottom') => PanelConfig[];
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

interface LayoutProviderProps {
  children: ReactNode;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const layoutHook = useLayoutState();
  
  return (
    <LayoutContext.Provider value={layoutHook}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

export default LayoutContext; 