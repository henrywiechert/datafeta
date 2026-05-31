// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Plot from '@observablehq/plot';
import { Field } from '../../types';
import {
  ChartGenerationContext,
  SharedDomains,
  FacetBackgroundInfo,
  PiePlotSpec,
} from '../types';
import { FacetPlan } from './facetPlanner';

/**
 * A single plot specification with position
 */
export interface PositionedPlot {
  id: string;
  title: string;
  options: Plot.PlotOptions;
  renderer?: 'observable-plot' | 'pie-svg';
  pieSpec?: PiePlotSpec;
  position: { row: number; col: number };
  /** Optional facet background info for this cell */
  facetBackground?: FacetBackgroundInfo;
  /** X-axis field for this cell (used by brush zoom) */
  xField?: Field;
  /** Y-axis field for this cell (used by brush zoom) */
  yField?: Field;
}

/**
 * Result from a cell generator containing one or more plots
 */
export interface CellResult {
  plots: PositionedPlot[];
  columns: number;
  rows: number;
  columnSizes?: Array<number | 'fr'>;
  rowSizes?: Array<number | 'fr'>;
  minColumnSizes?: number[];
  minRowSizes?: number[];
}

/**
 * Context describing the facet dimensions for the current cell.
 * Used to include facet field values in tooltips.
 */
export interface FacetCellContext {
  /** Fields used for row faceting */
  rowFacetFields: Field[];
  /** Fields used for column faceting */
  colFacetFields: Field[];
  /** Values for row facet fields in this cell (parallel to rowFacetFields) */
  rowValues: any[];
  /** Values for column facet fields in this cell (parallel to colFacetFields) */
  colValues: any[];
}

/**
 * Function that generates plot(s) for a single facet cell.
 * This is the strategy pattern - different chart types can provide different generators.
 */
export type CellGenerator = (
  cellData: any[],
  cellContext: ChartGenerationContext,
  sharedDomains: SharedDomains,
  facetPosition: { row: number; col: number },
  facetCellContext?: FacetCellContext
) => CellResult;

/**
 * Configuration for the faceting coordinator
 */
export interface FacetCoordinatorConfig {
  context: ChartGenerationContext;
  plan: FacetPlan;
  cellGenerator: CellGenerator;
  categoryField?: Field | null;
  sharedCategoryDomain?: any[];
}
