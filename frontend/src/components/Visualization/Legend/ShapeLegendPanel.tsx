// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo } from 'react';
import { Field, QueryResult } from '../../../types';
import { deriveShapeScaleInfo, ShapeScaleInfo } from '../../../observable-plot-generator/utils/shapeUtils';
import ShapeSymbolPreview from '../ShapeSymbolPreview';
import DiscreteEncodingLegendPanel from './DiscreteEncodingLegendPanel';
import type { LegendFilterAction } from './LegendPanel';

interface ShapeLegendPanelProps {
  shapeField: Field | null;
  queryResult: QueryResult | null;
  onFilterAction?: (action: LegendFilterAction, values: any[], allDomainValues: any[]) => void;
  onHighlightChange?: (values: any[] | null) => void;
  clearSelectionRef?: React.MutableRefObject<(() => void) | null>;
}

const renderShapeSwatch = (symbol: string) => <ShapeSymbolPreview symbol={symbol} fontSize="small" />;

const ShapeLegendPanel: React.FC<ShapeLegendPanelProps> = ({
  shapeField,
  queryResult,
  ...handlers
}) => {
  const scale = useMemo<ShapeScaleInfo | null>(() => {
    if (!shapeField || !queryResult?.rows?.length) return null;
    return deriveShapeScaleInfo(queryResult.rows, shapeField);
  }, [shapeField, queryResult]);

  return (
    <DiscreteEncodingLegendPanel
      title="Shape"
      field={shapeField}
      scale={scale}
      renderSwatch={renderShapeSwatch}
      {...handlers}
    />
  );
};

export default ShapeLegendPanel;
