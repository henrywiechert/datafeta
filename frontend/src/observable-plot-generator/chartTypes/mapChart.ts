// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Map chart — point map with bundled country outlines.
 *
 * X = longitude, Y = latitude (WGS84). Uses Observable Plot projection +
 * Plot.geo for outlines and Plot.dot for data marks.
 */
import * as Plot from '@observablehq/plot';
import { ColorChannel, Field, MapExtentMode, MapViewBounds } from '../../types';
import {
  DEFAULT_CHART_COLOR,
  MAP_MIN_HEIGHT_PX,
  MAP_MIN_WIDTH_PX,
  SIZE_DEFAULTS_BY_CHART_TYPE,
} from '../../config/chartLayoutConfig';
import { getResultColumnName, getFieldDisplayName } from '../../utils/fieldUtils';
import {
  boundsToProjectionDomain,
  computeGeoBounds,
  computeMapHomeBounds,
  filterValidGeoRows,
  formatMapPlotId,
  getWorldCountries,
  MAP_EQUAL_EARTH_ASPECT_RATIO,
  MAP_SINGLE_PLOT_ID,
  pickMapAxisFields,
  resolveMapProjectionDomain,
} from '../../utils/mapUtils';
import { computeProjectedAspectRatioForBounds } from '../../utils/mapProjectionFit';
import { deriveColorScaleInfo, ColorScaleInfo, resolveContextColorChannel } from '../utils/colorSchemeUtils';
import { createSizeScale } from '../utils/sizeUtils';
import { createTooltipFieldsGetter } from '../utils/tooltipUtils';
import {
  DEFAULT_MANUAL_SHAPE,
  deriveShapeScaleInfo,
  getSymbolForValue,
  MANUAL_NO_SHAPE,
  resolveManualShapeOption,
} from '../utils/shapeUtils';
import { ChartGenerationContext, PlotResult, SharedDomains } from '../types';
import { FacetPlan, planFacets } from '../faceting/facetPlanner';
import {
  coordinateFacetedGrid,
  CellGenerator,
  CellResult,
  FacetCellContext,
} from '../faceting/facetCoordinator';

const DEFAULT_PROJECTION = 'equal-earth';
const MAP_EMPTY_FACET_MESSAGE = 'No coordinates';

function buildMapFacetMessageOptions(message: string = MAP_EMPTY_FACET_MESSAGE): Plot.PlotOptions {
  return {
    marks: [
      Plot.text([message], {
        frameAnchor: 'middle',
        fontSize: 10,
        fill: '#888',
        lineWidth: 9,
        textAnchor: 'middle',
        textOverflow: 'clip',
      }),
    ],
    style: { overflow: 'hidden' },
  };
}

/** Private metadata attached to map Plot.PlotOptions for layout and pan/zoom. */
export interface MapPlotOptionsMetadata {
  __mapInteractive?: boolean;
  __mapHomeBounds?: MapViewBounds;
  /** View bounds used for the current render (override or home). */
  __mapCurrentView?: MapViewBounds;
  __mapPlotId?: string;
  __mapAspectRatio?: number;
}

export interface MapOptionsInput {
  data: any[];
  lonField: Field;
  latField: Field;
  color?: ColorChannel;
  sizeField?: Field | null;
  sizeRange?: [number, number];
  manualSize?: number;
  sizeScaleData?: any[];
  shapeField?: Field | null;
  manualShape?: string;
  tooltipFields?: Field[];
  facetFields?: Field[];
  colorScaleInfo?: ColorScaleInfo | null;
  outlineOpacity?: number;
  extentMode?: MapExtentMode;
  /** Transient pan/zoom override; when set, narrows projection domain from home. */
  viewBounds?: MapViewBounds | null;
  /** Stable plot cell id matching gridModel plot ids. */
  plotId?: string;
}

type ScatterBudget = {
  maxPoints: number;
  stratifyBy?: string;
  minPerStratum: number;
};

function computeMapBudget(data: any[], colorField?: Field): ScatterBudget {
  const hasDiscreteColor = !!colorField && colorField.flavour === 'discrete';
  return {
    maxPoints: hasDiscreteColor ? 20_000 : 100_000,
    minPerStratum: hasDiscreteColor ? 200 : 0,
    stratifyBy: hasDiscreteColor && colorField ? getResultColumnName(colorField) : undefined,
  };
}

function stratifiedSampleRows(
  rows: any[],
  stratifyBy: string,
  maxPoints: number,
  minPerStratum: number,
): any[] {
  if (rows.length <= maxPoints) return rows;
  const groups = new Map<any, any[]>();
  for (const row of rows) {
    const key = row?.[stratifyBy];
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const total = rows.length;
  const entries = Array.from(groups.entries());
  const picks: any[] = [];

  const shuffle = (arr: any[]) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const targets = entries.map(([, arr]) => {
    const proportional = Math.floor((maxPoints * arr.length) / total);
    const target = Math.min(arr.length, Math.max(minPerStratum, proportional));
    return { arr, target };
  });

  let currentTotal = targets.reduce((sum, t) => sum + t.target, 0);
  if (currentTotal > maxPoints) {
    targets.sort((a, b) => b.target - a.target);
    let i = 0;
    while (currentTotal > maxPoints && targets.length > 0) {
      const t = targets[i % targets.length];
      const floorMin = Math.min(t.arr.length, Math.max(minPerStratum, 1));
      if (t.target > floorMin) {
        t.target -= 1;
        currentTotal -= 1;
      }
      i += 1;
    }
  }

  for (const { arr, target } of targets) {
    picks.push(...shuffle([...arr]).slice(0, target));
  }
  return picks;
}

function applyMapBudget(rows: any[], colorField?: Field): any[] {
  const budget = computeMapBudget(rows, colorField);
  if (!budget.stratifyBy) {
    return rows.length <= budget.maxPoints ? rows : rows.slice(0, budget.maxPoints);
  }
  return stratifiedSampleRows(rows, budget.stratifyBy, budget.maxPoints, budget.minPerStratum);
}

export function buildMapOptions(input: MapOptionsInput): Plot.PlotOptions {
  const {
    data,
    lonField,
    latField,
    color,
    sizeField,
    sizeRange,
    manualSize,
    sizeScaleData,
    shapeField,
    manualShape,
    tooltipFields = [],
    facetFields = [],
    colorScaleInfo,
    outlineOpacity = 0.35,
    extentMode = 'data',
    viewBounds = null,
    plotId = MAP_SINGLE_PLOT_ID,
  } = input;

  const lonColumn = getResultColumnName(lonField);
  const latColumn = getResultColumnName(latField);
  const lonLabel = getFieldDisplayName(lonField);
  const latLabel = getFieldDisplayName(latField);
  const colorField = color?.field || undefined;

  const clean = filterValidGeoRows(data, lonColumn, latColumn);
  const bounds = computeGeoBounds(clean, lonColumn, latColumn);
  if (!bounds) {
    return buildMapFacetMessageOptions();
  }

  const budgeted = applyMapBudget(clean, colorField);
  const world = getWorldCountries();
  const homeBounds = computeMapHomeBounds(bounds, extentMode);
  const effectiveView = viewBounds ?? homeBounds;
  const projectionDomain = viewBounds
    ? boundsToProjectionDomain(viewBounds)
    : resolveMapProjectionDomain(bounds, extentMode);
  const mapAspectRatio = viewBounds
    ? computeProjectedAspectRatioForBounds(viewBounds)
    : extentMode === 'world'
      ? MAP_EQUAL_EARTH_ASPECT_RATIO
      : computeProjectedAspectRatioForBounds(bounds);

  const dotConfig: any = {
    x: lonColumn,
    y: latColumn,
    channels: {
      [lonLabel]: { value: lonColumn, label: lonLabel },
      [latLabel]: { value: latColumn, label: latLabel },
    },
  };

  const colorInfo = colorField && color
    ? (colorScaleInfo || deriveColorScaleInfo(budgeted, color))
    : null;

  if (colorField && colorInfo) {
    const colorColumnName = getResultColumnName(colorField);
    dotConfig.channels[colorField.columnName] = {
      value: colorColumnName,
      label: getFieldDisplayName(colorField),
    };
    if (colorInfo.kind === 'continuous' && colorInfo.accessor) {
      dotConfig.fill = (d: any) => colorInfo.accessor?.(d) ?? null;
    } else {
      dotConfig.fill = colorColumnName;
    }
  } else {
    dotConfig.fill = color?.manual || DEFAULT_CHART_COLOR;
  }

  const defaultDotRadius = manualSize ?? SIZE_DEFAULTS_BY_CHART_TYPE.map;
  if (sizeField && sizeRange) {
    const sizeScaleSource = Array.isArray(sizeScaleData) && sizeScaleData.length > 0 ? sizeScaleData : clean;
    const sizeScale = createSizeScale(sizeScaleSource, sizeField, sizeRange, defaultDotRadius);
    let sizeColumnName = getResultColumnName(sizeField);
    if (sizeField.type === 'measure' && !sizeField.aggregation) {
      const sumAlias = `SUM(${sizeField.columnName})`;
      if (clean.length && Object.prototype.hasOwnProperty.call(clean[0], sumAlias)) {
        sizeColumnName = sumAlias;
      }
    }
    dotConfig.r = (d: any) => sizeScale.getSizeForValue(d[sizeColumnName]);
    dotConfig.channels[sizeField.columnName] = {
      value: sizeColumnName,
      label: getFieldDisplayName(sizeField),
    };
  } else {
    dotConfig.r = defaultDotRadius;
  }

  const effectiveManualShape = resolveManualShapeOption(manualShape || DEFAULT_MANUAL_SHAPE);
  const hasManualShapeOverride = effectiveManualShape !== MANUAL_NO_SHAPE;
  if (shapeField) {
    const shapeColumnName = getResultColumnName(shapeField);
    const shapeInfo = deriveShapeScaleInfo(budgeted, shapeField);
    dotConfig.symbol = (d: any) => getSymbolForValue(d[shapeColumnName], shapeInfo);
    dotConfig.channels[shapeField.columnName] = {
      value: shapeColumnName,
      label: getFieldDisplayName(shapeField),
    };
    dotConfig.stroke = dotConfig.fill;
    dotConfig.fill = 'none';
    dotConfig.strokeWidth = 1.5;
  } else if (hasManualShapeOverride) {
    dotConfig.symbol = effectiveManualShape;
    dotConfig.stroke = dotConfig.fill;
    dotConfig.fill = 'none';
    dotConfig.strokeWidth = 1.5;
  }

  const plotOptions: Plot.PlotOptions = {
    projection: {
      type: DEFAULT_PROJECTION,
      domain: projectionDomain,
    },
    marks: [
      Plot.geo(world, {
        stroke: '#9aa0a6',
        strokeOpacity: outlineOpacity,
        fill: 'none',
      }),
      Plot.dot(budgeted, dotConfig),
    ],
    r: { type: 'identity' } as any,
  };

  if (colorField && colorInfo) {
    if (colorInfo.kind === 'continuous') {
      plotOptions.color = {
        type: 'linear',
        domain: colorInfo.domain as [number, number],
        range: colorInfo.range,
        clamp: true,
        label: getFieldDisplayName(colorField),
      } as any;
    } else {
      plotOptions.color = {
        type: 'ordinal' as any,
        domain: colorInfo.domain as any[],
        range: colorInfo.range,
        label: getFieldDisplayName(colorField),
      } as any;
    }
  }

  (plotOptions as MapPlotOptionsMetadata).__mapAspectRatio = mapAspectRatio;
  (plotOptions as MapPlotOptionsMetadata).__mapHomeBounds = homeBounds;
  (plotOptions as MapPlotOptionsMetadata).__mapCurrentView = effectiveView;
  (plotOptions as MapPlotOptionsMetadata).__mapPlotId = plotId;
  (plotOptions as MapPlotOptionsMetadata).__mapInteractive = true;

  (plotOptions as any).__customTooltip = {
    enabled: true,
    data: budgeted,
    getFields: createTooltipFieldsGetter(
      [
        { label: lonLabel, column: lonColumn },
        { label: latLabel, column: latColumn },
      ],
      colorField,
      sizeField || undefined,
      tooltipFields,
      undefined,
      facetFields,
      shapeField || undefined,
    ),
  };

  if (shapeField || hasManualShapeOverride) {
    const hoverR = typeof dotConfig.r === 'function' ? defaultDotRadius : (dotConfig.r || defaultDotRadius);
    (plotOptions.marks as any[]).push(
      Plot.dot(budgeted, {
        x: lonColumn,
        y: latColumn,
        r: hoverR,
        fill: 'transparent',
        stroke: 'transparent',
      }),
    );
  }

  return plotOptions;
}

function createMapMessage(message: string): PlotResult {
  return {
    library: 'observable-plot',
    plots: [
      {
        id: 'map-message',
        title: '',
        options: buildMapFacetMessageOptions(message),
        position: { row: 0, col: 0 },
      },
    ],
    layout: {
      type: 'grid',
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
    },
  };
}

function filterMapFacetPlan(
  plan: FacetPlan | null,
  lonField: Field,
  latField: Field,
): FacetPlan | null {
  if (!plan) return null;
  return {
    rowFacetFields: plan.rowFacetFields.filter((f) => f.id !== latField.id),
    colFacetFields: plan.colFacetFields.filter((f) => f.id !== lonField.id),
  };
}

function createMapCellGenerator(
  context: ChartGenerationContext,
  lonField: Field,
  latField: Field,
  isFaceted: boolean,
): CellGenerator {
  return (
    cellData: any[],
    _cellContext: ChartGenerationContext,
    sharedDomains: SharedDomains,
    facetPosition: { row: number; col: number },
    facetCellContext?: FacetCellContext,
  ): CellResult => {
    const color = resolveContextColorChannel(context);
    const facetFields = facetCellContext
      ? [...facetCellContext.rowFacetFields, ...facetCellContext.colFacetFields]
      : [];
    const plotId = formatMapPlotId(facetPosition, isFaceted);

    const options = buildMapOptions({
      data: cellData,
      lonField,
      latField,
      color,
      sizeField: context.sizeField || null,
      sizeRange: context.sizeRange,
      manualSize: context.manualSize,
      sizeScaleData: context.queryResult.rows,
      shapeField: context.shapeField || null,
      manualShape: context.manualShape,
      tooltipFields: context.tooltipFields,
      facetFields,
      colorScaleInfo: sharedDomains.colorScale,
      extentMode: context.mapExtentMode ?? 'data',
      plotId,
    });

    return {
      plots: [
        {
          id: 'map',
          title: '',
          options: options as any,
          position: { row: 0, col: 0 },
        },
      ],
      columns: 1,
      rows: 1,
      columnSizes: ['fr'],
      rowSizes: ['fr'],
      minColumnSizes: [MAP_MIN_WIDTH_PX],
      minRowSizes: [MAP_MIN_HEIGHT_PX],
    };
  };
}

export function generateMapGrid(context: ChartGenerationContext): PlotResult {
  const picked = pickMapAxisFields(context.xFields, context.yFields);
  if (!picked) {
    return createMapMessage('Map needs one numeric longitude field on X and one numeric latitude field on Y.');
  }
  const { lonField, latField } = picked;

  const filteredPlan = filterMapFacetPlan(planFacets(context), lonField, latField);
  const isFaceted = !!(
    filteredPlan &&
    (filteredPlan.rowFacetFields.length > 0 || filteredPlan.colFacetFields.length > 0)
  );
  const cellGenerator = createMapCellGenerator(context, lonField, latField, isFaceted);

  if (isFaceted && filteredPlan) {
    return coordinateFacetedGrid({
      context,
      plan: filteredPlan,
      cellGenerator,
    });
  }

  const cell = cellGenerator(
    context.queryResult.rows,
    context,
    { measure: {}, numeric: {}, categorical: {}, colorScale: null },
    { row: 0, col: 0 },
  );

  return {
    library: 'observable-plot',
    plots: cell.plots,
    layout: {
      type: 'grid',
      columns: cell.columns,
      rows: cell.rows,
      columnSizes: cell.columnSizes || ['fr'],
      rowSizes: cell.rowSizes || ['fr'],
      minColumnSizes: cell.minColumnSizes,
      minRowSizes: cell.minRowSizes,
    },
  };
}
