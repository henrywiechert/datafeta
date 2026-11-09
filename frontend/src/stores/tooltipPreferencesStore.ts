// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { create } from 'zustand';

interface TooltipPreferencesState {
  /** When true, chart tooltips open only on click (pinned), never on hover. */
  hoverDisabled: boolean;
  setHoverDisabled: (disabled: boolean) => void;
}

export const useTooltipPreferencesStore = create<TooltipPreferencesState>((set) => ({
  hoverDisabled: false,
  setHoverDisabled: (hoverDisabled) => set({ hoverDisabled }),
}));
