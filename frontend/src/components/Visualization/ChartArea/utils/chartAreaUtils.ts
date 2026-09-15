// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chart area utility functions
 */


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