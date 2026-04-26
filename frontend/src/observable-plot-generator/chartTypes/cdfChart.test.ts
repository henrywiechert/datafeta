import { buildCdfOptions } from './cdfChart';
import { Field } from '../../types';

jest.mock('@observablehq/plot', () => ({
  line: (data: any[], opts: any) => ({ type: 'line', data, opts }),
  dot: (data: any[], opts: any) => ({ type: 'dot', data, opts }),
  text: (data: any[], opts: any) => ({ type: 'text', data, opts }),
}));

const colorField: Field = {
  id: 'segment',
  columnName: 'segment',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

describe('buildCdfOptions', () => {
  it('uses a provided global color scale for facet-local CDF data', () => {
    const options = buildCdfOptions({
      data: [
        { revenue: 10, revenue__cdf: 0.5, segment: 'B' },
        { revenue: 20, revenue__cdf: 1, segment: 'B' },
      ],
      valueColumn: 'revenue',
      valueLabel: 'Revenue',
      colorField,
      colorScaleInfo: {
        kind: 'categorical',
        domain: ['A', 'B'],
        range: ['#111111', '#222222'],
      },
    });

    expect(options.color).toEqual({
      type: 'ordinal',
      domain: ['A', 'B'],
      range: ['#111111', '#222222'],
      label: 'segment',
    });

    const [lineMark, dotMark] = options.marks as any[];
    expect(lineMark.opts.stroke).toBe('segment');
    expect(lineMark.opts.z).toBe('segment');
    expect(dotMark.opts.fill).toBe('segment');
  });

  it('falls back to deriving color scale from the provided data when no global scale is provided', () => {
    const options = buildCdfOptions({
      data: [
        { revenue: 10, revenue__cdf: 0.5, segment: 'B' },
        { revenue: 20, revenue__cdf: 1, segment: 'B' },
      ],
      valueColumn: 'revenue',
      valueLabel: 'Revenue',
      colorField,
    });

    expect((options.color as any).domain).toEqual(['B']);
  });
});
