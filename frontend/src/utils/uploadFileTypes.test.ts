// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import {
  SQLITE_FILE_ACCEPT,
  dataFileAccept,
  fileFormatFor,
  formatLabelList,
  isZipArchive,
  needsStaging,
  selectionUsesOption,
  stripCompressionSuffix,
} from './uploadFileTypes';
import { TEST_FILE_FORMATS } from './fileFormats.fixture';

const file = (name: string) => new File(['x'], name);

describe('uploadFileTypes', () => {
  it('strips a trailing compression extension', () => {
    expect(stripCompressionSuffix('Sales.CSV.GZ')).toBe('sales.csv');
    expect(stripCompressionSuffix('events.jsonl.zst')).toBe('events.jsonl');
    expect(stripCompressionSuffix('plain.parquet')).toBe('plain.parquet');
  });

  it('detects zip archives', () => {
    expect(isZipArchive('dataset.ZIP')).toBe(true);
    expect(isZipArchive('sales.csv.gz')).toBe(false);
  });

  it('accepts the registered formats plus compression wrappers', () => {
    const accept = dataFileAccept(TEST_FILE_FORMATS).split(',');
    expect(accept).toEqual(expect.arrayContaining(['.csv', '.jsonl', '.xlsx', '.gz', '.zip']));
    expect(SQLITE_FILE_ACCEPT.split(',')).not.toContain('.xlsx');
  });

  it('lists format labels', () => {
    expect(formatLabelList(TEST_FILE_FORMATS)).toBe('CSV, Parquet, JSON or Excel');
    expect(formatLabelList([])).toBe('');
  });

  it('resolves the format of plain and compressed files', () => {
    expect(fileFormatFor('Report.XLSX', TEST_FILE_FORMATS)?.key).toBe('workbook');
    expect(fileFormatFor('legacy.xls.gz', TEST_FILE_FORMATS)?.key).toBe('workbook');
    expect(fileFormatFor('notes.txt', TEST_FILE_FORMATS)).toBeUndefined();
  });

  it('stages selections with multi-part files or zips', () => {
    expect(needsStaging([file('a.csv'), file('b.ods')], TEST_FILE_FORMATS)).toBe(true);
    expect(needsStaging([file('bundle.zip')], TEST_FILE_FORMATS)).toBe(true);
    expect(needsStaging([file('a.csv'), file('b.parquet.gz')], TEST_FILE_FORMATS)).toBe(false);
  });

  it('derives which option groups a selection uses', () => {
    expect(selectionUsesOption([file('a.xlsx')], TEST_FILE_FORMATS, 'csv')).toBe(false);
    expect(selectionUsesOption([file('a.xlsx')], TEST_FILE_FORMATS, 'date_formats')).toBe(true);
    expect(selectionUsesOption([file('a.zip')], TEST_FILE_FORMATS, 'csv')).toBe(true);
    expect(selectionUsesOption([file('a.parquet')], TEST_FILE_FORMATS, 'date_formats')).toBe(false);
  });
});
