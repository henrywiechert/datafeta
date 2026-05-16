// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Test for data validation utilities to ensure numeric aggregation results are handled correctly.
 */

import { validateAndCleanData, remapCastExpressionColumns } from '../utils/dataValidation';

describe('Data Validation', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('should handle SUM aggregation results as numbers', () => {
    const mockResult = {
      rows: [
        { category: 'A', 'SUM(amount)': 250.0 },
        { category: 'B', 'SUM(amount)': 500.0 },
        { category: 'C', 'SUM(amount)': 50.0 },
      ],
      row_count: 3
    };

    const cleanedResult = validateAndCleanData(mockResult);
    
    expect(cleanedResult.rows).toHaveLength(3);
    
    // Check that SUM values remain as numbers
    cleanedResult.rows.forEach((row: any) => {
      expect(typeof row['SUM(amount)']).toBe('number');
      expect(row['SUM(amount)']).toBeGreaterThan(0);
    });
  });

  test('should handle AVG aggregation results as numbers', () => {
    const mockResult = {
      rows: [
        { category: 'A', 'AVG(amount)': 125.0 },
        { category: 'B', 'AVG(amount)': 250.0 },
      ],
      row_count: 2
    };

    const cleanedResult = validateAndCleanData(mockResult);
    
    expect(cleanedResult.rows).toHaveLength(2);
    
    // Check that AVG values remain as numbers
    cleanedResult.rows.forEach((row: any) => {
      expect(typeof row['AVG(amount)']).toBe('number');
      expect(row['AVG(amount)']).toBeGreaterThan(0);
    });
  });

  test('should convert string numeric values if they represent valid numbers', () => {
    const mockResult = {
      rows: [
        { category: 'A', 'SUM(amount)': '250' }, // String that should be converted
        { category: 'B', 'SUM(amount)': 500.0 }, // Already a number
      ],
      row_count: 2
    };

    const cleanedResult = validateAndCleanData(mockResult);
    
    expect(cleanedResult.rows).toHaveLength(2);
    
    // Both should be numbers
    cleanedResult.rows.forEach((row: any) => {
      expect(typeof row['SUM(amount)']).toBe('number');
    });
  });

  test('should convert quoted numeric strings to numbers', () => {
    const mockResult = {
      rows: [
        { category: 'A', 'SUM(amount)': '"150235288461"' },
      ],
      row_count: 1
    };

    const cleanedResult = validateAndCleanData(mockResult);
    expect(cleanedResult.rows).toHaveLength(1);
    expect(typeof cleanedResult.rows[0]['SUM(amount)']).toBe('number');
    expect(cleanedResult.rows[0]['SUM(amount)']).toBe(150235288461);
  });

  test('should convert escaped-quoted numeric strings to numbers', () => {
    const mockResult = {
      rows: [
        { category: 'A', 'SUM(amount)': '\\"150235288461\\"' },
      ],
      row_count: 1
    };

    const cleanedResult = validateAndCleanData(mockResult);
    expect(cleanedResult.rows).toHaveLength(1);
    expect(typeof cleanedResult.rows[0]['SUM(amount)']).toBe('number');
    expect(cleanedResult.rows[0]['SUM(amount)']).toBe(150235288461);
  });

  test('should reject invalid numeric values', () => {
    const mockResult = {
      rows: [
        { category: 'A', 'SUM(amount)': NaN },
        { category: 'B', 'SUM(amount)': Infinity },
        { category: 'C', 'SUM(amount)': 250.0 },
      ],
      row_count: 3
    };

    const cleanedResult = validateAndCleanData(mockResult);
    
    expect(cleanedResult.rows).toHaveLength(3);
    
    // Invalid values should be converted to null
    expect(cleanedResult.rows[0]['SUM(amount)']).toBeNull();
    expect(cleanedResult.rows[1]['SUM(amount)']).toBeNull();
    expect(cleanedResult.rows[2]['SUM(amount)']).toBe(250.0);
  });

  test('should convert bigint COUNT results to numbers when safe', () => {
    const mockResult: any = {
      // Avoid BigInt literal syntax (508532n) to keep TS target compatibility
      rows: [{ 'COUNT(x)': BigInt('508532') }],
      row_count: 1
    };
    const cleaned = validateAndCleanData(mockResult);
    expect(cleaned.rows[0]['COUNT(x)']).toBe(508532);
  });

  test('should remap qualified COUNT(table.col) to COUNT(col) when fields expect unqualified name', () => {
    const mockResult: any = {
      columns: [{ name: 'COUNT(coreLoadControlData.slotUtilizationAvg)', type: 'unknown' }],
      rows: [{ 'COUNT(coreLoadControlData.slotUtilizationAvg)': 508532 }],
      row_count: 1,
    };

    const fields: any[] = [
      { type: 'measure', aggregation: 'count', columnName: 'slotUtilizationAvg' }, // unqualified expectation
    ];

    const remapped = remapCastExpressionColumns(mockResult, fields);
    expect(remapped.rows[0]['COUNT(slotUtilizationAvg)']).toBe(508532);
  });
});