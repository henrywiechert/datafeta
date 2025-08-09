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

// Hook-specific interfaces
export interface UseChartGenerationProps {
  xAxisFields: any[];
  yAxisFields: any[];
  useTableView: boolean;
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: () => void;
}

export interface UseQueryExecutionProps {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: any[];
  yAxisFields: any[];
  startOperation: (operationType: 'query' | 'rendering' | 'metadata', canCancel?: boolean) => void;
  completeOperation: () => void;
  dispatch: (action: any) => void;
}

export interface UseDataProcessingProps {
  xAxisFields: any[];
  yAxisFields: any[];
  queryResult: any;
}

export interface UseDebugViewProps {
  // No props needed for now
}

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