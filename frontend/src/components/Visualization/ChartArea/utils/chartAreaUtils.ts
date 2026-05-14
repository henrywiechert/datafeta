// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chart area utility functions
 */

/**
 * Calculates the dynamic maximum height for debug view based on window height
 * @param windowHeight - Current window height
 * @param maxPercentage - Maximum percentage of window height to use (default 70%)
 * @param minHeight - Minimum height in pixels (default 400px)
 * @returns Calculated maximum height
 */
export const calculateDynamicMaxHeight = (
  windowHeight: number,
  maxPercentage: number = 0.7,
  minHeight: number = 400
): number => {
  const calculatedHeight = Math.floor(windowHeight * maxPercentage);
  return Math.max(minHeight, calculatedHeight);
};

/**
 * Creates a window resize handler that updates max height
 * @param setMaxHeight - Function to set the maximum height
 * @param setCurrentHeight - Function to set the current height (optional)
 * @returns Cleanup function for the resize listener
 */
export const createResizeHandler = (
  setMaxHeight: (height: number) => void,
  setCurrentHeight?: (updater: (prev: number) => number) => void
) => {
  const updateMaxHeight = () => {
    const windowHeight = window.innerHeight;
    const newMaxHeight = calculateDynamicMaxHeight(windowHeight);
    setMaxHeight(newMaxHeight);
    
    // Ensure current height doesn't exceed new max height
    if (setCurrentHeight) {
      setCurrentHeight((prev: number) => Math.min(prev, newMaxHeight));
    }
  };

  // Initial calculation
  updateMaxHeight();
  
  // Add resize listener
  window.addEventListener('resize', updateMaxHeight);
  
  // Return cleanup function
  return () => window.removeEventListener('resize', updateMaxHeight);
};

/**
 * Logs operation timing information
 * @param operationName - Name of the operation
 * @param startTime - Start time in milliseconds
 * @param additionalInfo - Additional information to log
 */
export const logOperationTiming = (
  operationName: string,
  startTime: number,
  additionalInfo?: Record<string, any>
): void => {
  const duration = Date.now() - startTime;
  const info = additionalInfo ? JSON.stringify(additionalInfo) : '';
  console.log(`⏱️ ${operationName} completed in ${duration}ms ${info}`);
};

/**
 * Creates a console log for operation start
 * @param operationName - Name of the operation
 * @param details - Operation details
 */
export const logOperationStart = (
  operationName: string,
  details?: Record<string, any>
): void => {
  const detailsStr = details ? JSON.stringify(details) : '';
  console.log(`🔍 ${operationName} called ${detailsStr}`);
}; 