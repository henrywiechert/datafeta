import React from 'react';
import { Box } from '@mui/material';
import ChartGrid from '../../ChartGrid';
import TableView from '../../TableView';
import { VegaLiteSpec } from '../../../../spec-generator/types';
import { TableData } from '../types';

interface ChartRendererProps {
  useTableView: boolean;
  tableData: TableData;
  spec: VegaLiteSpec | null;
  queryResult: any;
  xAxisFields: any[];
  yAxisFields: any[];
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  useTableView,
  tableData,
  spec,
  queryResult,
  xAxisFields,
  yAxisFields,
}) => {
  if (useTableView) {
    return (
      <TableView 
        columns={tableData.columns} 
        rows={tableData.rows} 
        xFields={xAxisFields}
        yFields={yAxisFields}
      />
    );
  }
  
  return <ChartGrid spec={spec} data={queryResult} />;
};

export default ChartRenderer; 