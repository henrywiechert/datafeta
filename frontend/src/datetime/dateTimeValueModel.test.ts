import { normalizeDateTimeForBand } from './dateTimeValueModel';

describe('normalizeDateTimeForBand', () => {
  it('normalizes date-like domain and rows and returns tick formatter', () => {
    const domain = [new Date('2024-01-01T12:34:00Z'), '2024-01-01T12:35:00Z'];
    const rows = [
      { cat: new Date('2024-01-01T12:34:00Z'), value: 1 },
      { cat: '2024-01-01T12:35:00Z', value: 2 },
    ];

    const result = normalizeDateTimeForBand({ domain, rows, categoryColumn: 'cat' });

    expect(result.hasDateLike).toBe(true);
    expect(result.tickFormat).toBeInstanceOf(Function);
    expect(result.domain).toEqual(['2024-01-01 12:34:00', '2024-01-01 12:35:00']);
    expect(result.rows[0].cat).toEqual('2024-01-01 12:34:00');
    expect(result.rows[1].cat).toEqual('2024-01-01 12:35:00');
  });

  it('leaves non-date values untouched and omits tick formatter', () => {
    const domain = ['a', 'b'];
    const rows = [{ cat: 'a', value: 1 }];

    const result = normalizeDateTimeForBand({ domain, rows, categoryColumn: 'cat' });

    expect(result.hasDateLike).toBe(false);
    expect(result.tickFormat).toBeUndefined();
    expect(result.domain).toEqual(domain);
    expect(result.rows).toBe(rows); // same reference when unchanged
  });
});
