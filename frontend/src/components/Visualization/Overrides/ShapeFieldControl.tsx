// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Field } from '../../../types';
import {
  DEFAULT_MANUAL_SHAPE,
  MANUAL_NO_SHAPE,
  MANUAL_SHAPE_OPTIONS,
  ManualShapeOption,
  resolveManualShapeOption,
} from '../../../observable-plot-generator/utils/shapeUtils';
import ShapeSymbolPreview from '../ShapeSymbolPreview';
import DiscreteEncodingControl from './DiscreteEncodingControl';

interface ShapeFieldControlProps {
  field: Field | null;
  manualShape?: string;
  onDrop: (field: Field) => void;
  onManualShapeChange: (shape: ManualShapeOption) => void;
  onRemove: (fieldIds: string[]) => void;
}

const renderShapeOption = (symbol: ManualShapeOption) => <ShapeSymbolPreview symbol={symbol} fontSize="small" />;

const shapeOptionTitle = (symbol: ManualShapeOption) =>
  symbol === MANUAL_NO_SHAPE ? 'No shape' : `${symbol[0].toUpperCase()}${symbol.slice(1)}`;

const ShapeFieldControl: React.FC<ShapeFieldControlProps> = ({
  field,
  manualShape = DEFAULT_MANUAL_SHAPE,
  onDrop,
  onManualShapeChange,
  onRemove,
}) => (
  <DiscreteEncodingControl
    label="Shape"
    zoneSource="SHAPE_ZONE"
    field={field}
    manualValue={resolveManualShapeOption(manualShape)}
    manualOptions={MANUAL_SHAPE_OPTIONS}
    renderOption={renderShapeOption}
    optionTitle={shapeOptionTitle}
    manualTooltip="Pick a fixed shape or no shape"
    onDrop={onDrop}
    onManualChange={onManualShapeChange}
    onRemove={onRemove}
  />
);

export default ShapeFieldControl;
