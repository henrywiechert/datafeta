import { resolveSingleEncodingDropField } from './singleEncodingZone';
import { DragSource, Field } from '../types';

const makeField = (columnName: string, overrides?: Partial<Field>): Field => ({
  id: `${columnName}-id`,
  columnName,
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  ...overrides,
});

describe('resolveSingleEncodingDropField', () => {
  it('returns the same field instance when the drop comes from the same zone', () => {
    const field = makeField('species');

    const result = resolveSingleEncodingDropField({
      field,
      source: 'COLOR_ZONE',
      zoneSource: 'COLOR_ZONE',
    });

    expect(result).toBe(field);
  });

  it('clones the field with a new id when dropped from a different source', () => {
    const field = makeField('revenue', {
      type: 'measure',
      flavour: 'continuous',
      dataType: 'float',
    });

    const result = resolveSingleEncodingDropField({
      field,
      source: 'X_AXIS',
      zoneSource: 'SIZE_ZONE',
    });

    expect(result).not.toBe(field);
    expect(result?.id).toBeDefined();
    expect(result?.id).not.toBe(field.id);
    expect(result?.columnName).toBe('revenue');
  });

  it('resolves AVAILABLE_FIELDS drops against the latest available field registry', () => {
    const droppedField = makeField('status', { flavour: 'discrete' });
    const availableField = makeField('status', {
      id: droppedField.id,
      displayAlias: 'Current Status',
      flavour: 'continuous',
      dataType: 'float',
    });

    const result = resolveSingleEncodingDropField({
      field: droppedField,
      source: 'AVAILABLE_FIELDS',
      zoneSource: 'COLOR_ZONE',
      availableFields: [availableField],
    });

    expect(result?.id).toBeDefined();
    expect(result?.id).not.toBe(droppedField.id);
    expect(result?.displayAlias).toBe('Current Status');
    expect(result?.flavour).toBe('continuous');
  });

  it('returns null when a required flavour is not satisfied', () => {
    const field = makeField('value', {
      flavour: 'continuous',
      dataType: 'float',
    });

    const result = resolveSingleEncodingDropField({
      field,
      source: 'X_AXIS',
      zoneSource: 'SHAPE_ZONE',
      requiredFlavour: 'discrete',
    });

    expect(result).toBeNull();
  });

  it('returns null when AVAILABLE_FIELDS cannot resolve the current field metadata', () => {
    const result = resolveSingleEncodingDropField({
      field: makeField('missing'),
      source: 'AVAILABLE_FIELDS' as DragSource,
      zoneSource: 'COLOR_ZONE',
      availableFields: [],
    });

    expect(result).toBeNull();
  });
});