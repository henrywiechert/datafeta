// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { createContext, useContext } from 'react';
import { Field, DragSource } from '../types';

/**
 * Shelf targets a field can be assigned to from the tablet tap menu.
 * Mirrors the drop zones that HTML5 drag reaches on desktop.
 */
export type FieldAssignShelf =
  | 'x'
  | 'y'
  | 'filter'
  | 'color'
  | 'size'
  | 'shape'
  | 'label'
  | 'tooltip'
  | 'background'
  | 'table'
  | 'measureGroup';

export interface FieldAssignApi {
  assignToShelf: (shelf: FieldAssignShelf, field: Field, source: DragSource) => void;
}

const FieldAssignContext = createContext<FieldAssignApi | null>(null);

export function FieldAssignProvider({
  value,
  children,
}: {
  value: FieldAssignApi;
  children: React.ReactNode;
}) {
  return (
    <FieldAssignContext.Provider value={value}>
      {children}
    </FieldAssignContext.Provider>
  );
}

/** Returns null outside VisualizationPage / when no provider is mounted. */
export function useFieldAssign(): FieldAssignApi | null {
  return useContext(FieldAssignContext);
}
