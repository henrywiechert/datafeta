// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  ENCODING_FIELD_KEYS,
  listEncodingFields,
  listMarkEncodingFields,
  pickEncodingFields,
} from './encodingFields';
import { computeChartConfigHash, computeQueryConfigHash } from './sheetConfigHash';
import { createQueryAffectingConfig } from './queryAffectingConfig';
import { Field } from '../types';

const makeField = (columnName: string): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
});

const baseConfig = () => createQueryAffectingConfig({
  xAxisFields: [makeField('x')],
  yAxisFields: [],
  appliedFilterConfigurations: {},
});

describe('encodingFields', () => {
  it('pickEncodingFields fills every registered key, mapping undefined to null', () => {
    const color = makeField('color');
    expect(pickEncodingFields({ colorField: color })).toEqual(
      Object.fromEntries(ENCODING_FIELD_KEYS.map((key) => [key, key === 'colorField' ? color : null])),
    );
  });

  it('listEncodingFields returns assigned fields in registry order', () => {
    const shape = makeField('shape');
    const color = makeField('color');
    expect(listEncodingFields({ shapeField: shape, sizeField: null, colorField: color })).toEqual([color, shape]);
  });

  it('listMarkEncodingFields excludes pane encodings and honours replacements', () => {
    const color = makeField('color');
    const enrichedColor: Field = { ...color, id: 'color-enriched' };
    const size = makeField('size');
    const background = makeField('background');

    expect(listMarkEncodingFields(
      { colorField: color, sizeField: size, facetBackgroundField: background },
      { colorField: enrichedColor, sizeField: undefined },
    )).toEqual([enrichedColor]);
  });

  // Guards the point of the registry: a newly registered encoding field must
  // invalidate cached query results and chart specs without further wiring.
  it.each(ENCODING_FIELD_KEYS)('%s participates in the query and chart hashes', (key) => {
    const base = baseConfig();
    const withField = { ...base, [key]: makeField(`${key}-column`) };

    expect(computeQueryConfigHash(withField)).not.toBe(computeQueryConfigHash(base));
    expect(computeChartConfigHash(withField)).not.toBe(computeChartConfigHash(base));
  });
});
