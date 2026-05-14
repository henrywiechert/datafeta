// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../types';
import { buildFacetCombos, uniqueValuesForField } from './facetUtils';

export interface FacetSpace {
  rowValuesLevels: any[][];
  colValuesLevels: any[][];
  safeRowCombos: any[][];
  safeColCombos: any[][];
}

export function buildFacetSpace(rows: any[], rowFacetFields: Field[], colFacetFields: Field[]): FacetSpace {
  const rowValuesLevels = rowFacetFields.map((f) => uniqueValuesForField(rows, f));
  const colValuesLevels = colFacetFields.map((f) => uniqueValuesForField(rows, f));
  const rowCombos = buildFacetCombos(rowFacetFields, rowValuesLevels);
  const colCombos = buildFacetCombos(colFacetFields, colValuesLevels);

  return {
    rowValuesLevels,
    colValuesLevels,
    safeRowCombos: rowCombos.length > 0 ? rowCombos : [[]],
    safeColCombos: colCombos.length > 0 ? colCombos : [[]],
  };
}
