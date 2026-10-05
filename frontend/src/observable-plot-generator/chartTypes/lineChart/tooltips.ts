// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import type { Field, PinnedTooltipComparison } from '../../../types';
import { resolveColorForRow, type ColorScaleInfo } from '../../utils/colorSchemeUtils';
import { createTooltipFieldsGetter, formatTooltipValue } from '../../utils/tooltipUtils';
import { normalizeTooltipComparisonKey, seriesKeyOf } from './dataPrep';
import type { LineOrientation, SeriesPart } from './types';

function buildPinnedLineComparisonResolver(params: {
  dotData: any[];
  xColumn: string;
  yColumn: string;
  xLabel: string;
  yLabel: string;
  seriesParts: readonly SeriesPart[];
  colorContext: {
    scale: ColorScaleInfo | null;
    field?: Field;
    fallbackColor: string;
  };
  xField?: Field;
}): (datum: any) => PinnedTooltipComparison | undefined {
  const { dotData, xColumn, yColumn, xLabel, yLabel, seriesParts, colorContext, xField } = params;
  const seriesColumns = seriesParts.map((part) => part.column);

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
        const seriesKey = seriesKeyOf(row, seriesColumns);
        const seriesLabel = seriesParts
          .map((part) => formatTooltipValue(row?.[part.column], part.field))
          .join(' · ');
        const rowValue = row?.[yColumn];
        const percentDifference = suppressPercentages || typeof rowValue !== 'number' || !Number.isFinite(rowValue)
          ? undefined
          : ((rowValue - selectedValue) / Math.abs(selectedValue)) * 100;

        return {
          seriesKey,
          seriesLabel,
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
      title: `All Values At ${formatTooltipValue(datum?.[xColumn], xField)}`,
      comparisonBasis: 'plotted-dots',
      xLabel,
      xValue: datum?.[xColumn],
      xFormattedValue: formatTooltipValue(datum?.[xColumn], xField),
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
  /** Columns splitting the data into lines; enables the pinned per-x comparison. */
  seriesParts: readonly SeriesPart[];
  lineStyleField?: Field;
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
    seriesParts,
    lineStyleField,
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
    getPinnedComparison: seriesParts.length > 0
      ? buildPinnedLineComparisonResolver({
          dotData,
          xColumn,
          yColumn,
          xLabel,
          yLabel,
          seriesParts,
          colorContext,
          xField,
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
      facetFields,
      [lineStyleField]
    )
  };
}
