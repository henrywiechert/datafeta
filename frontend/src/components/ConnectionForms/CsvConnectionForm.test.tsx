// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CsvConnectionForm } from './CsvConnectionForm';
import { DEFAULT_CSV_STATE } from './types';

jest.mock('../../contexts/AppConfigContext', () => ({
  useFileFormats: () => jest.requireActual('../../utils/fileFormats.fixture').TEST_FILE_FORMATS,
}));

function renderWithFiles(names: string[], showAdvancedOptions = false) {
  const files = names.map((name) => new File(['x'], name));
  render(
    <CsvConnectionForm
      state={{ ...DEFAULT_CSV_STATE, selectedFiles: files, fileNames: names, showAdvancedOptions }}
      onUpdate={jest.fn()}
      onFileChange={jest.fn()}
      disabled={false}
    />
  );
}

describe('CsvConnectionForm file summary', () => {
  it('counts files per registered format', () => {
    renderWithFiles(['a.csv', 'b.parquet', 'c.xlsx', 'd.ods.gz', 'e.zip']);

    expect(screen.getByText('Selected: 5 files (1 CSV, 1 Parquet, 2 Excel, 1 ZIP)')).toBeInTheDocument();
  });

  it('lists the registered formats in the label', () => {
    renderWithFiles([]);

    expect(screen.getByText(/Data Files \(CSV, Parquet, JSON or Excel; may be compressed\)/)).toBeInTheDocument();
  });
});

describe('CsvConnectionForm parsing options', () => {
  it('offers only the date formats for workbooks', () => {
    renderWithFiles(['report.xlsx'], true);

    expect(screen.getByText(/Advanced Excel Options/)).toBeInTheDocument();
    expect(screen.queryByText('Delimiter')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MM/DD/YYYY HH:MM' })).toBeInTheDocument();
    expect(screen.getByText(/Excel: these formats are used for dates stored as text/)).toBeInTheDocument();
  });

  it('keeps the full CSV options when CSV files are selected', () => {
    renderWithFiles(['a.csv'], true);

    expect(screen.getByText(/Advanced CSV Options/)).toBeInTheDocument();
    expect(screen.getByText('Delimiter')).toBeInTheDocument();
    expect(screen.queryByText(/dates stored as text/)).not.toBeInTheDocument();
  });

  it('hides the options for Parquet-only selections', () => {
    renderWithFiles(['a.parquet']);

    expect(screen.queryByText(/Advanced (CSV|Excel) Options/)).not.toBeInTheDocument();
  });
});
