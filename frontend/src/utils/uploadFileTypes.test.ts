// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { DATA_FILE_ACCEPT, isZipArchive, stripCompressionSuffix } from './uploadFileTypes';

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

  it('accepts plain and compressed data files', () => {
    const accept = DATA_FILE_ACCEPT.split(',');
    expect(accept).toEqual(expect.arrayContaining(['.csv', '.jsonl', '.gz', '.zip']));
  });
});
