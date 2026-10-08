// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { buildPartResolution } from './usePartSelection';
import type { StagedUpload } from '../types';

jest.mock('../services/api', () => ({ apiService: {} }));

const workbook = (id: string, filename: string, parts: Array<[string, boolean]>): StagedUpload => ({
  upload_id: id,
  filename,
  format: 'workbook',
  part_label: 'sheet',
  parts: parts.map(([name, selectable]) => ({ name, selectable, reason: selectable ? null : 'hidden' })),
});

describe('buildPartResolution', () => {
  it('uses picked parts and records them per filename', () => {
    const uploads = [workbook('u1', 'shop.xlsx', [['A', true], ['B', true]])];

    expect(buildPartResolution(uploads, { u1: ['B'] })).toEqual({
      staged: [{ upload_id: 'u1', parts: ['B'] }],
      fileParts: { 'shop.xlsx': ['B'] },
    });
  });

  it('auto-selects a single loadable part that skipped the picker', () => {
    const uploads = [workbook('u1', 'one.xlsx', [['Data', true], ['Hidden', false]])];

    expect(buildPartResolution(uploads, {})).toEqual({
      staged: [{ upload_id: 'u1', parts: ['Data'] }],
      fileParts: { 'one.xlsx': ['Data'] },
    });
  });

  it('passes single-table files through and skips files with nothing picked', () => {
    const uploads: StagedUpload[] = [
      { upload_id: 'f1', filename: 'a.csv', format: 'csv', part_label: null, parts: null },
      workbook('u1', 'shop.xlsx', [['A', true], ['B', true]]),
    ];

    expect(buildPartResolution(uploads, { u1: [] })).toEqual({
      staged: [{ upload_id: 'f1' }],
      fileParts: {},
    });
  });

  it('lets the backend report a file without loadable parts', () => {
    const uploads = [workbook('u1', 'hidden.xlsx', [['Only', false]])];

    expect(buildPartResolution(uploads, {}).staged).toEqual([{ upload_id: 'u1' }]);
  });
});
