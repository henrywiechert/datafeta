// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { DEFAULT_AREA_FILL_OPACITY } from '../../../config/chartLayoutConfig';
import { getResultColumnName } from '../../../utils/fieldUtils';
import {
  deriveColorScaleInfo,
  deriveSplitSeriesGradientColorScale,
  resolveContextColorChannel,
} from '../../utils/colorSchemeUtils';
import { createLegacyLabelMark, prepareLabelData, LabelRenderConfig } from '../../utils/labelUtils';
import { prepareLineData } from './dataPrep';
import { attachLineDomainMetadata, buildLineAxes, recomputeDependentDomain } from './domains';
import { applyLineColorEncoding, applyLineSizeEncoding, attachLineColorScale } from './encodings';
import { buildAreaMarks, createBaseMarkConfigs, createHoverDotConfig } from './marks';
import { LINE_ORIENTATION } from './orientation';
import { attachLineTooltipMetadata } from './tooltips';
import type { LineBuildParams } from './types';

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
  } = params;
  const color = resolveContextColorChannel(params as any);
  const colorField = color.field ?? undefined;
  const colorBias = color.bias;
  const manualColor = color.manual || undefined;

  const O = LINE_ORIENTATION[orientation];
  const independentColumn = orientation === 'horizontal' ? xColumn : yColumn;
  const dependentColumn = orientation === 'horizontal' ? yColumn : xColumn;
  const colorColumnName = colorField ? getResultColumnName(colorField) : undefined;
  const { clean, budgetedSorted, dotData, axisKind } = prepareLineData({
    data,
    independentColumn,
    dependentColumn,
    colorField,
    colorColumnName,
    orientation,
    lineColorMode,
  });

  if (clean.length === 0) {
    return {
      x: { label: labels?.x || xColumn, domainKey: xColumn, grid: true } as any,
      y: { label: labels?.y || yColumn, domainKey: yColumn, grid: true } as any,
      marks: [],
    };
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
      : deriveColorScaleInfo(budgetedSorted, color)
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
    colorColumnName,
  });

  const xIsTime = axisKind === 'time' || (effectiveDomain?.x?.[0] instanceof Date);
  const yIsTime = effectiveDomain?.y?.[0] instanceof Date;

  const areaMarks = buildAreaMarks({
    variant,
    orientation,
    budgetedSorted,
    areaConfig,
    colorField,
    colorInfo,
    colorColumnName,
    manualColor,
  });

  const lineMarks = variant === 'area'
    ? [...areaMarks, Plot.line(budgetedSorted, lineConfig)]
    : [Plot.line(budgetedSorted, lineConfig)];
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
    colorColumnName,
    lineColorMode,
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

  attachSeriesHighlightData(plotOptions, budgetedSorted);
  
  return plotOptions;
}
