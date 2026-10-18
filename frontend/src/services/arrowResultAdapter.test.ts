// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import * as Arrow from 'apache-arrow';
import { Type } from 'apache-arrow';
import { arrowTableToRows, normalizeArrowValue } from './arrowResultAdapter';

describe('arrowTableToRows temporal units', () => {
  // Epoch magnitudes of different units overlap for dates near 1970 (e.g. 1938-1990).
  const dates = [new Date(Date.UTC(1938, 4, 1)), new Date(Date.UTC(1743, 10, 1)), new Date(Date.UTC(1990, 0, 1))];
  const types: Record<string, any> = {
    date32: new Arrow.DateDay(),
    date64: new Arrow.DateMillisecond(),
    second: new Arrow.TimestampSecond(),
    milli: new Arrow.TimestampMillisecond(),
    micro: new Arrow.TimestampMicrosecond(),
    nano: new Arrow.TimestampNanosecond(),
  };

  test.each(Object.keys(types))('%s decodes to the exact Date regardless of magnitude', (key) => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const table = new Arrow.Table({ c: Arrow.vectorFromArray(dates, types[key]) });
      const rows = arrowTableToRows(table);
      expect(rows.map((r) => (r.c as Date).getTime())).toEqual(dates.map((d) => d.getTime()));
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('normalizeArrowValue', () => {
  test('coerces numeric strings for numeric Arrow fields', () => {
    const result = normalizeArrowValue('"42.5"', { typeId: Type.Float } as any, 'value');

    expect(result).toBe(42.5);
  });

  test('coerces aggregate strings even without numeric field metadata', () => {
    const result = normalizeArrowValue("'12'", undefined, 'sum(revenue)');

    expect(result).toBe(12);
  });

  test('preserves unsafe integer strings for integer fields', () => {
    const unsafe = String(Number.MAX_SAFE_INTEGER + 10);

    const result = normalizeArrowValue(unsafe, { typeId: Type.Int } as any, 'id');

    expect(result).toBe(unsafe);
  });

  test('converts typed array uint32 limb pairs into safe integers', () => {
    const result = normalizeArrowValue(new Uint32Array([5, 0]));

    expect(result).toBe(5);
  });

  test('converts numeric wrappers via valueOf and sanitizes non-finite numbers', () => {
    class DecimalBigNum {
      valueOf() {
        return 7;
      }
    }

    expect(normalizeArrowValue(new DecimalBigNum(), { typeId: Type.Decimal } as any, 'metric')).toBe(7);
    expect(normalizeArrowValue(Number.NaN)).toBeNull();
    expect(normalizeArrowValue(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('arrowTableToRows', () => {
  test('uses raw timestamp extraction when available and normalizes other fields', () => {
    const timestampVector = {
      data: [
        {
          length: 1,
          offset: 0,
          values: new BigInt64Array([BigInt(1700000000123)]),
          nullBitmap: new Uint8Array([1]),
          nullCount: 0,
        },
      ],
      get: jest.fn(() => new Date('2024-01-01T00:00:00.000Z')),
    };

    const amountVector = {
      get: jest.fn(() => '55'),
    };

    const table = {
      numRows: 1,
      schema: {
        fields: [
          { name: 'ts', type: { typeId: Type.Timestamp } },
          { name: 'amount', type: { typeId: Type.Int } },
        ],
      },
      getChild: jest.fn((name: string) => {
        if (name === 'ts') return timestampVector;
        if (name === 'amount') return amountVector;
        return undefined;
      }),
    } as any;

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      expect(arrowTableToRows(table)).toEqual([
        {
          ts: 1700000000123,
          amount: 55,
        },
      ]);
      expect(table.getChild).toHaveBeenCalledWith('ts');
      expect(table.getChild).toHaveBeenCalledWith('amount');
    } finally {
      logSpy.mockRestore();
    }
  });
});