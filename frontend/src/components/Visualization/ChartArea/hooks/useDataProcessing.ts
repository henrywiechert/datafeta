import { useMemo } from 'react';
import { shouldUseTableView, prepareTableData } from '../../../../utils/tableViewUtils';
import { validateAndCleanData, logPerformanceWarning } from '../utils';
import { TableData } from '../types';

interface UseDataProcessingProps {
  xAxisFields: any[];
  yAxisFields: any[];
  queryResult: any;
}

interface UseDataProcessingReturn {
  useTableView: boolean;
  tableData: TableData;
  processedQueryResult: any;
  cleanData: (result: any) => any;
}

export const useDataProcessing = ({
  xAxisFields,
  yAxisFields,
  queryResult,
}: UseDataProcessingProps): UseDataProcessingReturn => {
  // Determine if we should show table view instead of chart
  const useTableView = useMemo(
    () => shouldUseTableView(xAxisFields, yAxisFields),
    [xAxisFields, yAxisFields]
  );

  // Prepare table data if using table view
  const tableData = useMemo(() => {
    if (useTableView && queryResult) {
      return prepareTableData(queryResult, xAxisFields, yAxisFields);
    }
    return { columns: [], rows: [] };
  }, [useTableView, queryResult, xAxisFields, yAxisFields]);

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
    useTableView,
    tableData,
    processedQueryResult,
    cleanData,
  };
}; 