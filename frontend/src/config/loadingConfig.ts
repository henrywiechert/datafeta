// Configuration for loading timeouts and behavior
export interface LoadingConfig {
  // Timeout values in milliseconds
  timeouts: {
    query: number;       // Time before showing modal for query execution
    rendering: number;   // Time before showing modal for chart rendering
    metadata: number;    // Time before showing modal for metadata loading
    worker: number;      // Timeout for Web Worker operations
    api: number;         // Timeout for API requests
  };
  
  // UI behavior configuration
  ui: {
    showProgressBar: boolean;         // Whether to show progress bar in modal
    showElapsedTime: boolean;         // Whether to show elapsed time counter
    allowCancellation: boolean;       // Whether cancellation is allowed by default
    autoCloseOnComplete: boolean;     // Whether to auto-close modal on completion
  };
  
  // Performance thresholds
  performance: {
    workerFallbackThreshold: number;  // Time before falling back to sync rendering
    largeDatasetThreshold: number;    // Row count considered "large dataset"
    complexChartThreshold: number;    // Field count considered "complex chart"
  };
}

// Default configuration
export const DEFAULT_LOADING_CONFIG: LoadingConfig = {
  timeouts: {
    query: 3000,      // 3 seconds
    rendering: 2000,  // 2 seconds
    metadata: 5000,   // 5 seconds
    worker: 30000,    // 30 seconds
    api: 60000,       // 60 seconds
  },
  
  ui: {
    showProgressBar: true,
    showElapsedTime: true,
    allowCancellation: true,
    autoCloseOnComplete: true,
  },
  
  performance: {
    workerFallbackThreshold: 5000,    // 5 seconds
    largeDatasetThreshold: 10000,     // 10,000 rows
    complexChartThreshold: 10,        // 10 fields
  },
};

// Environment-specific overrides
const getEnvironmentConfig = (): Partial<LoadingConfig> => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    return {
      timeouts: {
        query: 2000,      // 2 seconds in development
        rendering: 50,    // 50ms in development - show modal immediately for testing
        metadata: 3000,   // 3 seconds in development
        worker: 10000,    // 10 seconds in development
        api: 30000,       // 30 seconds in development
      },
    };
  }
  
  return {};
};

// Merge default config with environment-specific overrides
export const LOADING_CONFIG: LoadingConfig = {
  ...DEFAULT_LOADING_CONFIG,
  ...getEnvironmentConfig(),
  timeouts: {
    ...DEFAULT_LOADING_CONFIG.timeouts,
    ...getEnvironmentConfig().timeouts,
  },
  ui: {
    ...DEFAULT_LOADING_CONFIG.ui,
    ...getEnvironmentConfig().ui,
  },
  performance: {
    ...DEFAULT_LOADING_CONFIG.performance,
    ...getEnvironmentConfig().performance,
  },
};

// Utility functions for configuration
export const getTimeoutForOperation = (operationType: 'query' | 'rendering' | 'metadata' | 'worker' | 'api'): number => {
  return LOADING_CONFIG.timeouts[operationType];
};

export const shouldShowProgressBar = (): boolean => {
  return LOADING_CONFIG.ui.showProgressBar;
};

export const shouldShowElapsedTime = (): boolean => {
  return LOADING_CONFIG.ui.showElapsedTime;
};

export const shouldAllowCancellation = (): boolean => {
  return LOADING_CONFIG.ui.allowCancellation;
};

export const shouldAutoCloseOnComplete = (): boolean => {
  return LOADING_CONFIG.ui.autoCloseOnComplete;
};

export const isLargeDataset = (rowCount: number): boolean => {
  return rowCount > LOADING_CONFIG.performance.largeDatasetThreshold;
};

export const isComplexChart = (fieldCount: number): boolean => {
  return fieldCount > LOADING_CONFIG.performance.complexChartThreshold;
};

// Export for external configuration (could be used for user preferences)
export const updateLoadingConfig = (overrides: Partial<LoadingConfig>): void => {
  // In a real application, this might update a global configuration state
  // or save to localStorage/user preferences
  console.warn('updateLoadingConfig called but not implemented for runtime updates');
}; 