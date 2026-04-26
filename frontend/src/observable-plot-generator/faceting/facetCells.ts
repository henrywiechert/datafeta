import { ChartGenerationContext } from '../types';
import { buildCellDomains, buildSampleDomains } from './facetDomainContext';
import type { FacetDataIndex } from './facetDataIndex';
import type { FacetDomainContext } from './facetDomainContext';
import type { FacetPlan } from './facetPlanner';
import type { FacetSpace } from './facetSpace';
import type { CellGenerator, CellResult, FacetCellContext, PositionedPlot } from './facetCoordinator';

interface FacetBackgroundHelper {
  getBackgroundForData: (facetData: any[]) => {
    backgroundColor: string | null;
    isMixed: boolean;
  };
}

export interface SampleLayout {
  result: CellResult;
  baseCols: number;
  baseRows: number;
}

export interface FacetCellGenerationConfig {
  context: ChartGenerationContext;
  plan: FacetPlan;
  facetSpace: FacetSpace;
  dataIndex: FacetDataIndex;
  domainContext: FacetDomainContext;
  cellGenerator: CellGenerator;
  backgroundHelper: FacetBackgroundHelper | null;
  baseCols: number;
  baseRows: number;
}

export function generateSampleCellLayout(
  context: ChartGenerationContext,
  facetSpace: FacetSpace,
  dataIndex: FacetDataIndex,
  domainContext: FacetDomainContext,
  cellGenerator: CellGenerator
): SampleLayout {
  const sampleRows = dataIndex.getCellRows(
    facetSpace.safeRowCombos[0],
    facetSpace.safeColCombos[0]
  );
  const sampleDomains = buildSampleDomains(context, domainContext);
  const result = cellGenerator(sampleRows, context, sampleDomains, { row: 0, col: 0 });

  return {
    result,
    baseCols: result.columns,
    baseRows: result.rows,
  };
}

export function generateFacetCells(config: FacetCellGenerationConfig): PositionedPlot[] {
  const {
    context,
    plan,
    facetSpace,
    dataIndex,
    domainContext,
    cellGenerator,
    backgroundHelper,
    baseCols,
    baseRows,
  } = config;
  const { rowFacetFields, colFacetFields } = plan;
  const allPlots: PositionedPlot[] = [];

  for (let r = 0; r < facetSpace.safeRowCombos.length; r++) {
    for (let c = 0; c < facetSpace.safeColCombos.length; c++) {
      const rowValues = facetSpace.safeRowCombos[r];
      const colValues = facetSpace.safeColCombos[c];
      const cellData = dataIndex.getCellRows(
        rowValues,
        colValues
      );
      const cellDomains = buildCellDomains(context, domainContext, r, c);
      const facetCellContext: FacetCellContext = {
        rowFacetFields,
        colFacetFields,
        rowValues,
        colValues,
      };
      const cellResult = cellGenerator(cellData, context, cellDomains, { row: r, col: c }, facetCellContext);
      const facetBackground = backgroundHelper
        ? backgroundHelper.getBackgroundForData(cellData)
        : undefined;

      cellResult.plots.forEach((p) => {
        allPlots.push({
          ...p,
          id: `${p.id}-r${r}-c${c}`,
          position: {
            row: r * baseRows + p.position.row,
            col: c * baseCols + p.position.col,
          },
          facetBackground: facetBackground ? {
            backgroundColor: facetBackground.backgroundColor,
            isMixed: facetBackground.isMixed,
          } : undefined,
        });
      });
    }
  }

  return allPlots;
}
