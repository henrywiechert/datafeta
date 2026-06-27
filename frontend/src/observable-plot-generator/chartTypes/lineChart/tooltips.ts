// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import type { Field, LineColorMode, PinnedTooltipComparison } from '../../../types';
import { lineColorSplitsSeries } from '../../../utils/lineColorEncoding';
import { resolveColorForRow, type ColorScaleInfo } from '../../utils/colorSchemeUtils';
import { createTooltipFieldsGetter, formatTooltipValue } from '../../utils/tooltipUtils';
import { normalizeTooltipComparisonKey } from './dataPrep';
import type { LineOrientation } from './types';

function buildPinnedLineComparisonResolver(params: {
  dotData: any[];
  xColumn: string;
  yColumn: string;
  xLabel: string;
  yLabel: string;
  colorColumnName: string;
  colorContext: {
    scale: ColorScaleInfo | null;
    field?: Field;
    fallbackColor: string;
  };
}): (datum: any) => PinnedTooltipComparison | undefined {
  const { dotData, xColumn, yColumn, xLabel, yLabel, colorColumnName, colorContext } = params;

  return (datum: any): PinnedTooltipComparison | undefined => {
    const selectedXKey = normalizeTooltipComparisonKey(datum?.[xColumn]);
    const peers = dotData.filter((row) => normalizeTooltipComparisonKey(row?.[xColumn]) === selectedXKey);

    if (peers.length <= 1) {
      return undefined;
    }

    const selectedValue = datum?.[yColumn];
    const suppressPercentages = typeof selectedValue !== 'number' || !Number.isFinite(selectedValue) || selectedValue === 0;

    const items = peers
      .map((row) => {
        const seriesValue = row?.[colorColumnName];
        const seriesKey = normalizeTooltipComparisonKey(seriesValue);
        const rowValue = row?.[yColumn];
        const percentDifference = suppressPercentages || typeof rowValue !== 'number' || !Number.isFinite(rowValue)
          ? undefined
          : ((rowValue - selectedValue) / Math.abs(selectedValue)) * 100;

        return {
          seriesKey,
          seriesLabel: formatTooltipValue(seriesValue),
          colorHex: resolveColorForRow(row, colorContext.scale, colorContext.field, colorContext.fallbackColor),
          value: rowValue,
          formattedValue: formatTooltipValue(rowValue),
          percentDifference,
          isSelected: row === datum,
        };
      })
      .sort((left, right) => {
        const leftValue = typeof left.value === 'number' && Number.isFinite(left.value) ? Math.abs(left.value) : -Infinity;
        const rightValue = typeof right.value === 'number' && Number.isFinite(right.value) ? Math.abs(right.value) : -Infinity;
        return rightValue - leftValue;
      });

    return {
      title: `All Values At ${formatTooltipValue(datum?.[xColumn])}`,
      comparisonBasis: 'plotted-dots',
      xLabel,
      xValue: datum?.[xColumn],
      xFormattedValue: formatTooltipValue(datum?.[xColumn]),
      valueLabel: yLabel,
      items,
    };
  };
}

export function attachLineTooltipMetadata(params: {
  plotOptions: Plot.PlotOptions;
  dotData: any[];
  xColumn: string;
  yColumn: string;
  xLabel: string;
  yLabel: string;
  colorField?: Field;
  colorColumnName?: string;
  lineColorMode?: LineColorMode;
  colorContext: {
    scale: ColorScaleInfo | null;
    field?: Field;
    fallbackColor: string;
  };
  sizeField?: Field;
  tooltipFields?: Field[];
  facetFields?: Field[];
  xField?: Field;
  yField?: Field;
  orientation: LineOrientation;
}): void {
  const {
    plotOptions,
    dotData,
    xColumn,
    yColumn,
    xLabel,
    yLabel,
    colorField,
    colorColumnName,
    lineColorMode,
    colorContext,
    sizeField,
    tooltipFields,
    facetFields,
    xField,
    yField,
    orientation,
  } = params;

  // Use dotData (not budgetedSorted) because Observable Plot stores numeric
  // indices into the data array passed to Plot.dot() in __data__. The tooltip
  // resolver looks up config.data[index], so it must match the dots' data source.
  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: dotData,
    showVerticalGuideLine: orientation === 'horizontal',
    comparisonColorContext: colorContext,
    getPinnedComparison: lineColorSplitsSeries(colorField, lineColorMode) && colorColumnName
      ? buildPinnedLineComparisonResolver({
          dotData,
          xColumn,
          yColumn,
          xLabel,
          yLabel,
          colorColumnName,
          colorContext,
        })
      : undefined,
    getFields: createTooltipFieldsGetter(
      [
        { label: xLabel, column: xColumn, sourceField: xField },
        { label: yLabel, column: yColumn, sourceField: yField }
      ],
      colorField,
      sizeField,
      tooltipFields,
      undefined, // No excludeColumns
      facetFields
    )
  };
}
