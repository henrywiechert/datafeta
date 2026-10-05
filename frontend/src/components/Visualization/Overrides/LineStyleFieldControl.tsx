// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { Field } from '../../../types';
import {
  DEFAULT_MANUAL_LINE_STYLE,
  getLineStyleTitle,
  LINE_STYLES,
  LineStyleOption,
  resolveManualLineStyle,
} from '../../../observable-plot-generator/utils/lineStyleUtils';
import LineStylePreview from '../LineStylePreview';
import DiscreteEncodingControl from './DiscreteEncodingControl';

interface LineStyleFieldControlProps {
  field: Field | null;
  manualLineStyle?: string;
  onDrop: (field: Field) => void;
  onManualLineStyleChange: (style: LineStyleOption) => void;
  onRemove: (fieldIds: string[]) => void;
}

const renderLineStyleOption = (style: LineStyleOption) => <LineStylePreview style={style} fontSize="small" />;

const LineStyleFieldControl: React.FC<LineStyleFieldControlProps> = ({
  field,
  manualLineStyle = DEFAULT_MANUAL_LINE_STYLE,
  onDrop,
  onManualLineStyleChange,
  onRemove,
}) => (
  <DiscreteEncodingControl
    label="Line style"
    zoneSource="LINE_STYLE_ZONE"
    field={field}
    manualValue={resolveManualLineStyle(manualLineStyle)}
    manualOptions={LINE_STYLES}
    renderOption={renderLineStyleOption}
    optionTitle={getLineStyleTitle}
    manualTooltip="Pick a fixed line style"
    onDrop={onDrop}
    onManualChange={onManualLineStyleChange}
    onRemove={onRemove}
  />
);

export default LineStyleFieldControl;
