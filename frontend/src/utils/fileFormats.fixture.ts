// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Test fixture: the format catalog as the backend publishes it in
 * /app-config `fileFormats` (backend/connectors/file_handlers). Tests only.
 */
import type { FileFormatInfo } from '../services/api/appConfigApi';

export const TEST_FILE_FORMATS: FileFormatInfo[] = [
  { key: 'csv', label: 'CSV', extensions: ['.csv'], options: ['csv', 'date_formats'], partLabel: null },
  { key: 'parquet', label: 'Parquet', extensions: ['.parquet'], options: [], partLabel: null },
  { key: 'json', label: 'JSON', extensions: ['.json', '.ndjson', '.jsonl'], options: [], partLabel: null },
  {
    key: 'workbook',
    label: 'Excel',
    extensions: ['.xlsx', '.xlsm', '.xls', '.xlsb', '.ods'],
    options: ['date_formats'],
    partLabel: 'sheet',
  },
];
