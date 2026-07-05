// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useMemo } from 'react';
import { validateAndCleanData, logPerformanceWarning } from '../utils';
import { UserChartType } from '../../../../types';

interface UseDataProcessingProps {
  xAxisFields: any[];
  yAxisFields: any[];
  queryResult: any;
  globalChartType?: UserChartType | null;
}

interface UseDataProcessingReturn {
  processedQueryResult: any;
  cleanData: (result: any) => any;
}

export const useDataProcessing = ({
  queryResult,
}: UseDataProcessingProps): UseDataProcessingReturn => {
  // Process query result with data validation and cleaning
  const processedQueryResult = useMemo(() => {
    if (!queryResult) {
      return null;
    }

    const cleanedResult = validateAndCleanData(queryResult);
    
    // Log performance warnings if needed
    if (cleanedResult.row_count) {
      logPerformanceWarning(cleanedResult.row_count);
    }
    
    return cleanedResult;
  }, [queryResult]);

  // Expose the clean data function for external use
  const cleanData = validateAndCleanData;

  return {
    processedQueryResult,
    cleanData,
  };
}; 