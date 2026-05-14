// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useState, useCallback } from 'react';

export interface PanelConfig {
  id: string;
  title: string;
  position: 'left' | 'right' | 'bottom';
  width: number;
  visible: boolean;
  collapsible: boolean;
  collapsed: boolean;
}

export interface LayoutState {
  panels: Record<string, PanelConfig>;
  mainContentPadding: number;
}

const DEFAULT_PANELS: Record<string, PanelConfig> = {
  fields: {
    id: 'fields',
    title: 'Fields',
    position: 'left',
    width: 300,
    visible: true,
    collapsible: true,
    collapsed: false,
  },
  properties: {
    id: 'properties',
    title: 'Properties',
    position: 'right',
    width: 280,
    visible: true,
    collapsible: true,
    collapsed: false,
  },
  dataPreview: {
    id: 'dataPreview',
    title: 'Data Preview',
    position: 'bottom',
    width: 200,
    visible: false,
    collapsible: true,
    collapsed: false,
  },
  filters: {
    id: 'filters',
    title: 'Filters',
    position: 'left',
    width: 250,
    visible: false,
    collapsible: true,
    collapsed: false,
  },
};

export function useLayoutState() {
  const [layoutState, setLayoutState] = useState<LayoutState>({
    panels: DEFAULT_PANELS,
    mainContentPadding: 16,
  });

  const togglePanel = useCallback((panelId: string) => {
    setLayoutState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelId]: {
          ...prev.panels[panelId],
          visible: !prev.panels[panelId].visible,
        },
      },
    }));
  }, []);

  const collapsePanel = useCallback((panelId: string) => {
    setLayoutState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelId]: {
          ...prev.panels[panelId],
          collapsed: !prev.panels[panelId].collapsed,
        },
      },
    }));
  }, []);

  const resizePanel = useCallback((panelId: string, width: number) => {
    setLayoutState(prev => ({
      ...prev,
      panels: {
        ...prev.panels,
        [panelId]: {
          ...prev.panels[panelId],
          width: Math.max(200, Math.min(600, width)), // Min 200px, max 600px
        },
      },
    }));
  }, []);

  const resetLayout = useCallback(() => {
    setLayoutState({
      panels: DEFAULT_PANELS,
      mainContentPadding: 16,
    });
  }, []);

  const getVisiblePanels = useCallback(() => {
    return Object.values(layoutState.panels).filter(panel => panel.visible);
  }, [layoutState.panels]);

  const getPanelsByPosition = useCallback((position: 'left' | 'right' | 'bottom') => {
    return Object.values(layoutState.panels)
      .filter(panel => panel.visible && panel.position === position)
      .sort((a, b) => a.id.localeCompare(b.id)); // Sort by ID for consistent order
  }, [layoutState.panels]);

  return {
    layoutState,
    togglePanel,
    collapsePanel,
    resizePanel,
    resetLayout,
    getVisiblePanels,
    getPanelsByPosition,
  };
}

export default useLayoutState; 