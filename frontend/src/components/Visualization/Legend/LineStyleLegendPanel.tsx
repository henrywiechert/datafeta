// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useMemo } from 'react';
import { Field, QueryResult } from '../../../types';
import {
  deriveLineStyleScale,
  LineStyleName,
  LineStyleScale,
} from '../../../observable-plot-generator/utils/lineStyleUtils';
import LineStylePreview from '../LineStylePreview';
import DiscreteEncodingLegendPanel from './DiscreteEncodingLegendPanel';
import type { LegendFilterAction } from './LegendPanel';

interface LineStyleLegendPanelProps {
  lineStyleField: Field | null;
  queryResult: QueryResult | null;
  onFilterAction?: (action: LegendFilterAction, values: any[], allDomainValues: any[]) => void;
  onHighlightChange?: (values: any[] | null) => void;
  clearSelectionRef?: React.MutableRefObject<(() => void) | null>;
}

const renderLineStyleSwatch = (style: LineStyleName) => <LineStylePreview style={style} fontSize="small" />;

const LineStyleLegendPanel: React.FC<LineStyleLegendPanelProps> = ({
  lineStyleField,
  queryResult,
  ...handlers
}) => {
  const scale = useMemo<LineStyleScale | null>(() => {
    if (!lineStyleField || !queryResult?.rows?.length) return null;
    return deriveLineStyleScale(queryResult.rows, lineStyleField);
  }, [lineStyleField, queryResult]);

  return (
    <DiscreteEncodingLegendPanel
      title="Line style"
      field={lineStyleField}
      scale={scale}
      renderSwatch={renderLineStyleSwatch}
      {...handlers}
    />
  );
};

export default LineStyleLegendPanel;
