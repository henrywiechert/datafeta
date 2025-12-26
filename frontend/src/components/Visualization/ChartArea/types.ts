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

export interface TableData {
  columns: any[];
  rows: any[];
}

export interface ChartAreaProps {
  // Future props will be added here as needed
}

// Note: Hook-specific interfaces (UseQueryExecutionProps, UseQueryBuilderProps, etc.)
// are now defined in their respective hook files for better colocation and type safety.

// Component-specific interfaces
export interface ChartRendererProps {
  useTableView: boolean;
  tableData: TableData;
  spec: any | null;
  queryResult: any;
  xAxisFields: any[];
  yAxisFields: any[];
}

export interface ChartControlsProps {
  isDebugOpen: boolean;
  onToggleDebug: () => void;
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