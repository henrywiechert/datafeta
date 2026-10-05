// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DEFAULT_AREA_FILL_OPACITY } from '../../../config/chartLayoutConfig';
import type { LineSeriesLabelMode } from '../../../types';
import { getFieldDisplayName, getResultColumnName } from '../../../utils/fieldUtils';
import { lineColorSplitsSeries } from '../../../utils/lineColorEncoding';
import {
  deriveColorScaleInfo,
  deriveSplitSeriesGradientColorScale,
  resolveContextColorChannel,
} from '../../utils/colorSchemeUtils';
import { createLegacyLabelMark, prepareLabelData, LabelRenderConfig } from '../../utils/labelUtils';
import { prepareLineData, seriesKeyOf } from './dataPrep';
import { attachLineDomainMetadata, attachLineDomainReceiver, buildLineAxes, padIndependentDomain, recomputeDependentDomain } from './domains';
import { applyLineColorEncoding, applyLineSizeEncoding, attachLineColorScale, buildStyledLineMarks } from './encodings';
import {
  buildAreaMarks,
  buildSeriesEndLabelMarks,
  createBaseMarkConfigs,
  createHoverDotConfig,
  seriesEndLabelTexts,
} from './marks';
import { LINE_ORIENTATION } from './orientation';
import { attachLineTooltipMetadata } from './tooltips';
import type { LineBuildParams, SeriesPart } from './types';

function attachSeriesHighlightData(plotOptions: Plot.PlotOptions, budgetedSorted: any[]): void {
  // Series highlight stamping should resolve category values for line paths too.
  // Line marks bind against budgetedSorted, while tooltip lookup uses dotData.
  // Provide the line dataset explicitly for stampColorCategories.
  (plotOptions as any).__seriesHighlightData = budgetedSorted;
}

/**
 * Unified line chart builder supporting both horizontal (x=independent) and vertical (y=independent) orientations.
 */
export function buildLineOptions(params: LineBuildParams): Plot.PlotOptions {
  const {
    data,
    xColumn,
    yColumn,
    orientation,
    labels,
    domain,
    sizeField,
    sizeRange,
    manualSize,
    sizeScaleData,
    labelCfg,
    tooltipFields,
    facetFields,
    xField,
    yField,
    variant = 'line',
    areaFillOpacity = DEFAULT_AREA_FILL_OPACITY,
    lineColorMode = 'alongPath',
    seriesLabels = 'off',
    colorScaleInfo,
    lineStyle,
  } = params;
  const color = resolveContextColorChannel(params as any);
  const colorField = color.field ?? undefined;
  const colorBias = color.bias;
  const manualColor = color.manual || undefined;

  const O = LINE_ORIENTATION[orientation];
  const independentColumn = orientation === 'horizontal' ? xColumn : yColumn;
  const dependentColumn = orientation === 'horizontal' ? yColumn : xColumn;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
  const lineStyleField = lineStyle?.field;
  const lineStyleColumn = lineStyleField ? getResultColumnName(lineStyleField) : undefined;
  // One line per combination of these columns' values.
  const seriesParts: SeriesPart[] = [
    ...(colorColumnName && lineColorSplitsSeries(colorField, lineColorMode)
      ? [{ column: colorColumnName, field: colorField }]
      : []),
    ...(lineStyleColumn ? [{ column: lineStyleColumn, field: lineStyleField }] : []),
  ];
  const seriesColumns = seriesParts.map((part) => part.column);
  const { clean, budgetedSorted, dotData, axisKind, seriesGroups } = prepareLineData({
    data,
    independentColumn,
    dependentColumn,
    seriesColumns,
    orientation,
  });

  if (clean.length === 0) {
    // An empty facet cell still owns an axis gutter when it leads its grid row
    // or column, so it keeps the caller's domain and adopts the harmonized one.
    const emptyOptions: Plot.PlotOptions = {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true, domain: domain?.x } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true, domain: domain?.y } as any,
      marks: [],
    };
    attachLineDomainReceiver({ plotOptions: emptyOptions, axis: O.dependentAxis, column: dependentColumn });
    attachLineDomainReceiver({ plotOptions: emptyOptions, axis: O.independentAxis, column: independentColumn });
    return emptyOptions;
  }

  // Always compute the dependent-axis domain from the actually-plotted data.
  // The caller-supplied domain (from computeSharedMeasureDomains) may use
  // bar-chart stacking logic that inflates the range far beyond any individual
  // value - wrong for line charts. For faceted grids the coordinator will
  // harmonize per-cell domains into a shared scale afterwards.
  const plotData = budgetedSorted.length > 0 ? budgetedSorted : clean;
  const recomputedDependent = recomputeDependentDomain(plotData, dependentColumn, variant === 'area');
  let effectiveDomain = domain;
  if (recomputedDependent) {
    effectiveDomain = {
      ...domain,
      [O.dependentAxis]: recomputedDependent,
    };
  }

  // Grid cells clip overflow, so 'end' labels need room carved out of the scale;
  // where the axis has no numeric domain to pad, fall back to labelling inside.
  // The gutter is sized from the same labels the mark will emit, so both must
  // be derived from the same inputs.
  const labelTexts = seriesLabels === 'off' ? [] : seriesEndLabelTexts({
    seriesGroups,
    colorColumnName,
    seriesColumns,
  });
  const paddedIndependent = seriesLabels === 'end' && seriesGroups
    ? padIndependentDomain(plotData, independentColumn, axisKind, labelTexts, labelCfg?.fontSize)
    : undefined;
  if (paddedIndependent) {
    effectiveDomain = {
      ...effectiveDomain,
      [O.independentAxis]: paddedIndependent,
    };
  }
  const effectiveSeriesLabels: LineSeriesLabelMode =
    seriesLabels === 'end' && !paddedIndependent ? 'endInside' : seriesLabels;

  const xLabel = labels?.x || xColumn;
  const yLabel = labels?.y || yColumn;
  const { lineConfig, areaConfig, dotConfig } = createBaseMarkConfigs({
    xColumn,
    yColumn,
    xLabel,
    yLabel,
    areaFillOpacity,
  });

  const useSeriesGradient =
    colorField &&
    colorField.flavour === 'continuous' &&
    lineColorMode === 'bySeries';
  const colorInfo = colorField
    ? useSeriesGradient
      ? deriveSplitSeriesGradientColorScale(budgetedSorted, color)
      : (colorScaleInfo ?? deriveColorScaleInfo(budgetedSorted, color))
    : null;
  const comparisonColorContext = applyLineColorEncoding({
    lineConfig,
    areaConfig,
    dotConfig,
    colorField,
    colorInfo,
    colorColumnName,
    colorBias,
    manualColor,
  });

  // A line-style field splits lines further than color does, so group every
  // series-aware mark by the full series key.
  const seriesZ = lineStyleColumn ? (d: any) => seriesKeyOf(d, seriesColumns) : undefined;
  if (seriesZ && lineStyleField) {
    lineConfig.z = seriesZ;
    areaConfig.z = seriesZ;
    dotConfig.channels[lineStyleField.columnName] = { value: lineStyleColumn, label: getFieldDisplayName(lineStyleField) };
  }

  applyLineSizeEncoding({
    lineConfig,
    dotConfig,
    budgetedSorted,
    sizeField,
    sizeRange,
    manualSize,
    sizeScaleData,
  });

  // Add invisible larger dots for better hover detection.
  // Include the same z/stroke grouping as the visible dots so that Observable
  // Plot's pointer selection stays within the correct series when multiple
  // series overlap at the same x position.
  const hoverDotConfig = createHoverDotConfig({
    xColumn,
    yColumn,
    z: seriesZ ?? colorColumnName,
  });

  // axisKind describes the independent axis, which is y for vertical lines.
  const independentIsTime = axisKind === 'time';
  const xIsTime = (O.independentAxis === 'x' && independentIsTime) || (effectiveDomain?.x?.[0] instanceof Date);
  const yIsTime = (O.independentAxis === 'y' && independentIsTime) || (effectiveDomain?.y?.[0] instanceof Date);

  const areaMarks = buildAreaMarks({
    variant,
    orientation,
    budgetedSorted,
    seriesGroups,
    areaConfig,
    colorField,
    colorInfo,
    manualColor,
  });

  const styledLineMarks = buildStyledLineMarks({
    data: budgetedSorted,
    lineConfig,
    lineStyle,
    lineStyleColumn,
  });
  const lineMarks = variant === 'area'
    ? [...areaMarks, ...styledLineMarks]
    : styledLineMarks;
  const axes = buildLineAxes({
    xColumn,
    yColumn,
    labels,
    effectiveDomain,
    xIsTime,
    yIsTime,
  });

  const plotOptions: Plot.PlotOptions = {
    ...axes,
    marks: [
      ...lineMarks,
      Plot.dot(dotData, dotConfig),
      Plot.dot(dotData, hoverDotConfig),
      ...buildSeriesEndLabelMarks({
        mode: effectiveSeriesLabels,
        orientation,
        seriesGroups,
        sourceRows: budgetedSorted,
        xColumn,
        yColumn,
        colorColumnName,
        seriesColumns,
        colorField,
        colorInfo,
        fallbackColor: comparisonColorContext.fallbackColor,
        fontSize: labelCfg?.fontSize,
      }),
    ],
  };

  if (labelCfg) {
    const labelConfig: LabelRenderConfig = {
      data: budgetedSorted,
      xColumn,
      yColumn,
      labelFields: labelCfg.labelFields,
      labelsEnabled: labelCfg.labelsEnabled,
      samplingStrategy: labelCfg.samplingStrategy,
      samplingThreshold: labelCfg.samplingThreshold,
      sampleEvery: labelCfg.sampleEvery,
      fontSize: labelCfg.fontSize,
      chartType: O.chartType
    };
    const prepared = prepareLabelData(labelConfig);
    const labelMark = createLegacyLabelMark(prepared, labelConfig, xColumn, yColumn);
    if (labelMark) {
      (plotOptions.marks = plotOptions.marks || []).push(labelMark as any);
    }
  }
  attachLineColorScale({ plotOptions, colorField, colorInfo });

  attachLineTooltipMetadata({
    plotOptions,
    dotData,
    xColumn,
    yColumn,
    xLabel,
    yLabel,
    colorField,
    seriesParts,
    lineStyleField,
    colorContext: comparisonColorContext,
    sizeField,
    tooltipFields,
    facetFields,
    xField,
    yField,
    orientation,
  });

  // Metadata for facet-grid harmonization: the coordinator merges per-cell
  // domains so all facets share the same scale (see harmonizeLineChartDomains).
  attachLineDomainMetadata({
    plotOptions,
    axis: O.dependentAxis,
    column: dependentColumn,
    domain: recomputedDependent,
  });

  // The label gutter must be identical in every facet cell, otherwise cells
  // sharing an external axis gutter would disagree about the scale.
  attachLineDomainMetadata({
    plotOptions,
    axis: O.independentAxis,
    column: independentColumn,
    domain: paddedIndependent,
  });

  attachSeriesHighlightData(plotOptions, budgetedSorted);
  
  return plotOptions;
}
