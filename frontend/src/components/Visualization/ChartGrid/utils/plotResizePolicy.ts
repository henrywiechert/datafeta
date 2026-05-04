import { DistributionVariant, Field, FieldOverrideState, UserChartType } from '../../../../types';
import { GridResultModel, getPlotGridCells } from '../../../../observable-plot-generator/gridModel';
import {
  CellChartType,
  detectDefaultChartTypeForPair,
  mapUserChartTypeToCellChartType,
} from '../../../../observable-plot-generator/helpers/chartTypeResolver';

export interface PlotResizePolicy {
  allowColumnResize: boolean;
  allowRowResize: boolean;
}

function applyDistributionVariant(
  cellType: CellChartType,
  distributionVariant: DistributionVariant,
): CellChartType {
  if (distributionVariant !== 'box-plot') return cellType;
  if (cellType === 'tickX') return 'boxX';
  if (cellType === 'tickY') return 'boxY';
  return cellType;
}

function resolveSingleAxisCellChartType(
  xField?: Field,
  yField?: Field,
): CellChartType | null {
  if (xField && !yField) {
    return xField.type === 'measure' ? 'barX' : null;
  }
  if (!xField && yField) {
    return yField.type === 'measure' ? 'barY' : null;
  }
  return null;
}

function resolvePrimaryCellChartType(
  grid: GridResultModel,
  fieldOverrides: Record<string, FieldOverrideState>,
  globalChartType: UserChartType | null | undefined,
  distributionVariant: DistributionVariant,
): CellChartType | null {
  const firstPlotCell = getPlotGridCells(grid)[0];
  const xField = firstPlotCell?.metadata?.xField;
  const yField = firstPlotCell?.metadata?.yField;

  if (!xField && !yField) return null;

  const singleAxisType = resolveSingleAxisCellChartType(xField, yField);
  if (singleAxisType) return singleAxisType;
  if (!xField || !yField) return null;

  const xOverride = fieldOverrides[xField.id];
  const yOverride = fieldOverrides[yField.id];
  const cellOverride = xOverride?.chartType ? xOverride : yOverride;

  if (cellOverride?.chartType) {
    const overrideAxis = xOverride?.chartType ? 'x' : 'y';
    return mapUserChartTypeToCellChartType(
      cellOverride.chartType,
      overrideAxis,
      xField,
      yField,
      distributionVariant,
    );
  }

  if (globalChartType) {
    return mapUserChartTypeToCellChartType(
      globalChartType,
      xField.type === 'measure' ? 'x' : 'y',
      xField,
      yField,
      distributionVariant,
    );
  }

  return applyDistributionVariant(
    detectDefaultChartTypeForPair(xField, yField),
    distributionVariant,
  );
}

export function resolvePlotResizePolicy(
  grid: GridResultModel,
  fieldOverrides: Record<string, FieldOverrideState> = {},
  globalChartType: UserChartType | null | undefined = null,
  distributionVariant: DistributionVariant = 'tick-strip',
): PlotResizePolicy {
  const cellType = resolvePrimaryCellChartType(grid, fieldOverrides, globalChartType, distributionVariant);

  if (cellType === 'barX' || cellType === 'tickX' || cellType === 'boxX') {
    return { allowColumnResize: true, allowRowResize: false };
  }

  if (cellType === 'barY' || cellType === 'tickY' || cellType === 'boxY') {
    return { allowColumnResize: false, allowRowResize: true };
  }

  return { allowColumnResize: true, allowRowResize: true };
}
