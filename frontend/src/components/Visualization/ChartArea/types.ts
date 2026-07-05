// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Types and interfaces for ChartArea module
 */

export interface ChartAreaState {
  isDebugOpen: boolean;
  debugHeight: number;
  maxDebugHeight: number;
  queryDescription: any | null;
  spec: any | null;
  chartInfo: any | null;
  renderingError: string | null;
}

export interface AbortControllers {
  queryAbortController: AbortController | null;
  renderingAbortController: AbortController | null;
}

export interface ChartGenerationOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export interface OperationTiming {
  operationName: string;
  startTime: number;
  additionalInfo?: Record<string, any>;
}

export interface ChartAreaProps {
  // Future props will be added here as needed
}

// Note: Hook-specific interfaces (UseQueryExecutionProps, UseQueryBuilderProps, etc.)
// are now defined in their respective hook files for better colocation and type safety.

export interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
  bandThicknessScale?: number;
  onBandThicknessScaleChange?: (scale: number) => void;
}

export interface DebugPanelProps {
  isDebugOpen: boolean;
  debugHeight: number;
  maxDebugHeight: number;
  onDebugResize: (newHeight: number) => void;
  queryDescription: any | null;
  queryResult: any;
  queryError: string | null;
  spec: any | null;
  chartInfo: any | null;
  renderingError: string | null;
} 