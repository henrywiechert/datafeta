import { ChartGenerationContext, PlotResult } from '../types';
import { getFieldColumnName } from '../helpers/fields';
import { resolveMeasureAlias, buildBarOptions, computeBandPaddingFromSizeField, sortCategoriesByValue } from './barCore';
import { deriveColorScaleInfo } from '../utils/colorSchemeUtils';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import { BAR_STEP_PX, MIN_BAR_STEP_PX, BAND_PADDING } from '../../config/chartLayoutConfig';
// Label utilities
import { createLegacyLabelMark, prepareLabelData, LabelRenderConfig } from '../utils/labelUtils';
// Tick strip for continuous dimensions
import { tickStrip } from './tickStrip';
import { isMeasureValuesField, combineMeasureValuesOverrides } from '../../utils/syntheticFields';

/**
 * Unified bar chart builder for 1+ measures (and optionally continuous dimensions) on a single axis.
 * - Single measure → returns single Plot options
 * - Multiple measures → returns grid of small-multiple bar charts
 * - Continuous dimensions → returns tick strips
 * - Mixed → returns grid with both bars and tick strips stacked
 *
 * Harmonizes:
 * - Category derivation (composite categories across all opposite-axis discrete dimensions)
 * - Band padding computed from size field or manual size (same fallback for all)
 * - Value domains shared across measures
 * - Single-bar intrinsic sizing multiplier kept consistent
 */
export function barUnified(
  context: ChartGenerationContext,
  labelCfg?: { labelFields: any[]; labelsEnabled: boolean; samplingStrategy: 'auto' | 'all' | 'sample'; samplingThreshold: number; sampleEvery: number }
): PlotResult {
  const { queryResult, xFields, yFields, colorField, colorScheme, manualColor, sizeField, manualSize, tooltipFields, fieldOverrides, measureValuesSourceFields } = context;
  const data = queryResult.rows;
  
  // Check if MeasureValues is being used and get combined overrides from source measures
  const hasMeasureValuesOnAxis = [...xFields, ...yFields].some(f => isMeasureValuesField(f));
  const combinedMeasureOverride = hasMeasureValuesOnAxis
    ? combineMeasureValuesOverrides(measureValuesSourceFields, fieldOverrides)
    : undefined;
  
  // Use combined override values if available (for MeasureValues charts)
  const effectiveManualSize = combinedMeasureOverride?.manualSize ?? manualSize;
  const effectiveManualColor = combinedMeasureOverride?.manualColor ?? manualColor;

  // Determine orientation and collect both measures and continuous dimensions
  const yMeasures = yFields.filter(f => f.type === 'measure');
  const xMeasures = xFields.filter(f => f.type === 'measure');
  const yContinuousDims = yFields.filter(f => f.type === 'dimension' && f.flavour === 'continuous');
  const xContinuousDims = xFields.filter(f => f.type === 'dimension' && f.flavour === 'continuous');
  
  if (yMeasures.length === 0 && xMeasures.length === 0 && yContinuousDims.length === 0 && xContinuousDims.length === 0) {
    throw new Error('Bar/tick strip chart requires at least one measure or continuous dimension.');
  }

  const orientation: 'vertical' | 'horizontal' = (yMeasures.length + yContinuousDims.length) > 0 ? 'vertical' : 'horizontal';
  const measures = orientation === 'vertical' ? yMeasures : xMeasures;
  const continuousDims = orientation === 'vertical' ? yContinuousDims : xContinuousDims;

  // Category dimensions strategy: 
  // - If we have continuous dimensions on the same axis, do NOT use categories
  //   (each bar/strip should show the total, not broken down by category)
  // - Otherwise, use opposite-axis discrete dims; fallback to same-axis discrete dims if none
  const hasContinuousDimsOnSameAxis = continuousDims.length > 0;
  const oppDims = orientation === 'vertical'
    ? xFields.filter(f => f.type === 'dimension' && f.flavour !== 'continuous')
    : yFields.filter(f => f.type === 'dimension' && f.flavour !== 'continuous');
  const sameDims = orientation === 'vertical'
    ? yFields.filter(f => f.type === 'dimension' && f.flavour !== 'continuous')
    : xFields.filter(f => f.type === 'dimension' && f.flavour !== 'continuous');
  const categoryDims = hasContinuousDimsOnSameAxis ? [] : (oppDims.length > 0 ? oppDims : sameDims);

  const hasCategories = categoryDims.length > 0;
  const categoryAccessor = hasCategories
    ? (row: any) => categoryDims.map((d: any) => row[getFieldColumnName(d)]).join(' • ')
    : undefined;
  const categories = hasCategories
    ? (Array.from(new Set(data.map(categoryAccessor as any))) as any[]).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
      )
    : undefined;
  const categoryColumn = hasCategories ? '__category' : undefined;

  // Color mapping (consistent with single-measure bar)
  const colorColumn = colorField ? getResultColumnName(colorField) : undefined;
  const colorScale = colorField ? deriveColorScaleInfo(data, colorField, colorScheme, context.colorBias) : null;

  // Dynamic band padding with consistent fallback for all cases
  // Use effective manual size which may come from combined MeasureValues overrides
  const bandPadding = computeBandPaddingFromSizeField(data, sizeField, { manualSize: effectiveManualSize }) ?? BAND_PADDING;

  // Shared value domains across measures for consistent scaling
  const sharedDomains = calculateSharedDomains(measures as any[], data);

  // Apply bar sorting if specified on any measure
  // Use the first measure with a non-'none' sort order
  let sortedCategories = categories;
  if (hasCategories && categories) {
    const measureWithSort = measures.find((m: any) => m.barSortOrder && m.barSortOrder !== 'none');
    if (measureWithSort) {
      const sortMeasureName = resolveMeasureAlias(measureWithSort as any);
      // Build aggregated data for sorting
      const aggregatedForSort = data.map(row => ({
        [sortMeasureName]: row[sortMeasureName],
        [categoryColumn!]: (categoryAccessor as any)(row)
      }));
      sortedCategories = sortCategoriesByValue(
        categories,
        aggregatedForSort,
        categoryColumn!,
        sortMeasureName,
        (measureWithSort as any).barSortOrder
      );
    }
  }

  const plots = measures.map((measure, idx) => {
    const measureName = resolveMeasureAlias(measure as any);

    // Build aggregated dataset mapping composite category when present
    const aggregated = categoryColumn
      ? data.map(row => ({ [measureName]: row[measureName], [categoryColumn]: (categoryAccessor as any)(row), ...(colorColumn ? { [colorColumn]: (row as any)[colorColumn] } : {}) }))
      : (
          // When no categories but we do have a color column, keep per-row data for stacking by color.
          colorColumn
            ? data
            : buildTotalOnlyData(data, measureName)
        );

    const useStackedDomain = !categoryColumn && !!colorColumn;

    const options = buildBarOptions({
      data: aggregated,
      measureName,
      orientation,
      categoryColumn,
      categoriesDomain: sortedCategories,
      colorColumn,
      colorScale,
      bandPadding,
      valueDomainOverride: useStackedDomain ? undefined : sharedDomains[measureName],
      tooltipFields: tooltipFields,
      // When there's no color field, use the global/effective manualColor as the bar fill
      manualColor: colorField ? undefined : effectiveManualColor,
      measureField: measure,
      labels: {
        measure: getFieldDisplayName(measure),
        category: hasCategories && categoryDims.length === 1 
          ? getFieldDisplayName(categoryDims[0]) 
          : hasCategories 
            ? categoryDims.map((d: any) => getFieldDisplayName(d)).join(' • ')
            : undefined,
      },
    });

    // --- Label integration -------------------------------------------------
    if (labelCfg) {
      
      // For bar charts we want one label per visible bar segment. Our aggregated dataset already
      // represents either categories (one row per category) or stacking segments (one row per color when stacked).
      // We approximate small segment filtering (<10px) only for stacked case by comparing relative value ratio.
      let labelData = aggregated;
      
      // When categories are present AND we have color (stacked bars), we need RAW data for Plot.stackY()
      // Observable Plot's stackY transform computes cumulative positions from raw values
      // When categories are present WITHOUT color, we aggregate as before
      if (categoryColumn && colorColumn) {
        // For stacked bars with categories: use raw data, Plot.stackY will handle the stacking
        labelData = aggregated; // Already has category, measure, and color columns
      } else if (categoryColumn) {
        // For non-stacked categorical bars: aggregate by category only
        const aggregatedMap = new Map<string, any>();
        for (const row of aggregated) {
          const key = String(row[categoryColumn]);
          if (!aggregatedMap.has(key)) {
            aggregatedMap.set(key, {
              [measureName]: 0,
              [categoryColumn]: row[categoryColumn]
            });
          }
          const existing = aggregatedMap.get(key);
          const val = row[measureName];
          if (typeof val === 'number' && isFinite(val)) {
            existing[measureName] += val;
          }
        }
        labelData = Array.from(aggregatedMap.values());
      }
      
      // Bars are stacked whenever we have a color field (regardless of whether we have categories)
      // - With categories + color: bars stacked within each category
      // - Without categories + color: single stacked bar
      const isStacked = !!colorColumn;
      if (isStacked && !categoryColumn) {
        // Only filter small segments for single stacked bars (not for categorical stacked bars)
        const total = labelData.reduce((sum: number, r: any) => sum + (typeof r[measureName] === 'number' ? r[measureName] : 0), 0) || 0;
        if (total > 0) {
          // Keep segments >=1% of total
          labelData = labelData.filter(r => {
            const v = r[measureName];
            if (typeof v !== 'number' || !isFinite(v)) return false;
            return v / total >= 0.01;
          });
        }
      }
      // When we have categories and color segments (grouped by category & color) labelData now has one row per unique combination.
      // When we have categories only: one row per category -> fine.
      // When we have neither categories nor color: single bar -> need synthetic category.
      const needsSyntheticCategory = !categoryColumn && !colorColumn;

      const labelConfig: LabelRenderConfig = {
        data: labelData,
        xColumn: orientation === 'vertical' ? (categoryColumn || '__single_category') : measureName,
        yColumn: orientation === 'vertical' ? measureName : (categoryColumn || '__single_category'),
        labelFields: labelCfg.labelFields as any[],
        labelsEnabled: labelCfg.labelsEnabled,
        samplingStrategy: labelCfg.samplingStrategy,
        samplingThreshold: labelCfg.samplingThreshold,
        sampleEvery: labelCfg.sampleEvery,
        chartType: 'bar',
        orientation,
        colorColumn: colorColumn,
        isStacked: isStacked
      };
      // Inject synthetic category column BEFORE sampling when there is no category and no color (single total bar)
      if (needsSyntheticCategory) {
        if (orientation === 'vertical') {
          labelConfig.data = labelConfig.data.map(r => ({ ...r, __single_category: ' ' }));
          labelConfig.xColumn = '__single_category';
        } else {
          labelConfig.data = labelConfig.data.map(r => ({ ...r, __single_category: ' ' }));
          labelConfig.yColumn = '__single_category';
        }
      }
      const prepared = prepareLabelData(labelConfig);
      
      const mark = createLegacyLabelMark(prepared, labelConfig, labelConfig.xColumn, labelConfig.yColumn);
      if (mark) {
        (options.marks = options.marks || []).push(mark as any);
      }
    }

    return {
      id: `${orientation === 'vertical' ? 'y' : 'x'}-measure-${idx}`,
      title: measureName,
      options,
      position: orientation === 'vertical' ? { row: idx, col: 0 } : { row: 0, col: idx }
    };
  });

  // Add tick strips for continuous dimensions
  const tickStripPlots = continuousDims.map((dim, idx) => {
    const dimCol = getFieldColumnName(dim);
    const axis = orientation === 'horizontal' ? 'x' : 'y';
    const tickOptions = tickStrip(context, axis, dimCol, categoryColumn, {
      dimension: getFieldDisplayName(dim),
      category: hasCategories && categoryDims.length === 1 
        ? getFieldDisplayName(categoryDims[0]) 
        : hasCategories 
          ? categoryDims.map((d: any) => getFieldDisplayName(d)).join(' • ')
          : undefined
    }, sharedDomains);
    
    const plotIdx = measures.length + idx;
    return {
      id: `${orientation === 'vertical' ? 'y' : 'x'}-dim-${idx}`,
      title: getFieldDisplayName(dim),
      options: tickOptions,
      position: orientation === 'vertical' ? { row: plotIdx, col: 0 } : { row: 0, col: plotIdx }
    };
  });

  // Combine bar plots and tick strip plots
  const allPlots = [...plots, ...tickStripPlots];

  const thicknessScale = context.bandThicknessScale ?? 1;

  // Always return a grid-style PlotResult (even for a single plot) so that
  // the renderer uses the unified left-side label/axis layout.
  const categoryCount = hasCategories && categories ? categories.length : 1;
  const baseIntrinsicSize = Math.max(BAR_STEP_PX, categoryCount * BAR_STEP_PX);
  const baseMinSize = Math.max(MIN_BAR_STEP_PX, categoryCount * MIN_BAR_STEP_PX);
  const intrinsicSize = Math.max(1, baseIntrinsicSize * thicknessScale);
  const minSize = Math.max(1, baseMinSize * thicknessScale);
  
  const columnSizes = orientation === 'horizontal'
    ? Array.from({ length: allPlots.length }, () => 'fr' as const)
    : [intrinsicSize];
  const rowSizes = orientation === 'horizontal'
    ? [intrinsicSize]
    : Array.from({ length: allPlots.length }, () => 'fr' as const);
  
  // Minimum sizes for resize constraints - based on MIN_BAR_STEP_PX per category
  const minColumnSizes = orientation === 'horizontal'
    ? undefined  // 'fr' columns don't have a fixed minimum
    : [minSize];
  const minRowSizes = orientation === 'horizontal'
    ? [minSize]
    : undefined;  // 'fr' rows don't have a fixed minimum

  return {
    library: 'observable-plot',
    plots: allPlots,
    sharedDomains,
    layout: {
      type: 'grid',
      columns: orientation === 'horizontal' ? allPlots.length : 1,
      rows: orientation === 'horizontal' ? 1 : allPlots.length,
      columnSizes,
      rowSizes,
      minColumnSizes,
      minRowSizes,
    },
  };
}

// ---- Helpers (local) -------------------------------------------------------

/**
 * If no categories, either forward a single row or produce a single summed total row.
 */
function buildTotalOnlyData(data: any[], measureName: string) {
  if (data.length <= 1) {
    const v = data[0]?.[measureName] ?? 0;
    return [{ [measureName]: typeof v === 'number' ? v : 0 }];
  }
  const total = data
    .map((r: any) => r?.[measureName])
    .filter((v: any) => typeof v === 'number' && isFinite(v))
    .reduce((a: number, b: number) => a + b, 0);
  return [{ [measureName]: total }];
}

/**
 * Calculate shared domains across all measures (0..max padded by 5%).
 */
function calculateSharedDomains(measures: any[], data: any[]) {
  const domains: Record<string, [number, number]> = {};
  const PAD = 0.05;
  measures.forEach(measure => {
    const fieldForName = { ...measure, aggregation: measure.aggregation || 'sum' };
    const measureName = getResultColumnName(fieldForName as any);
    const values = data.map(row => row[measureName]).filter((v: any) => typeof v === 'number' && isFinite(v));
    if (values.length === 0) {
      domains[measureName] = [0, 1];
      return;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Negative-only
    if (max <= 0) {
      const magnitude = Math.max(Math.abs(min), Math.abs(max));
      const pad = magnitude === 0 ? 1 : magnitude * PAD;
      domains[measureName] = [min - pad, 0];
      return;
    }
    // Positive-only
    if (min >= 0) {
      const upper = max * (1 + PAD);
      domains[measureName] = [0, upper === 0 ? 1 : upper];
      return;
    }
    // Mixed
    const span = max - min;
    const pad = span * PAD;
    domains[measureName] = [min - pad, max + pad];
  });
  return domains;
}


