// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { connectionApi } from './connectionApi';

describe('connectionApi staged uploads (sheet picker)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok', uploads: [], added_tables: [] }),
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const lastRequest = () => {
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    return { url: url as string, body: init.body as FormData };
  };

  it('stages files as multipart form data', async () => {
    await connectionApi.stageFiles([new File(['x'], 'book.xlsx')]);

    const { url, body } = lastRequest();
    expect(url).toContain('/stage-files');
    expect(body.getAll('uploaded_files')).toHaveLength(1);
  });

  it('connects with staged uploads instead of files', async () => {
    const staged = [{ upload_id: 'u1', sheets: ['Orders'] }];

    await connectionApi.connect({ type: 'csv' }, undefined, staged);

    const { url, body } = lastRequest();
    expect(url).toMatch(/\/connect$/);
    expect(body.getAll('uploaded_files')).toHaveLength(0);
    expect(JSON.parse(body.get('staged_uploads_json') as string)).toEqual(staged);
  });

  it('still requires files or staged uploads for csv', async () => {
    await expect(connectionApi.connect({ type: 'csv' }, undefined, [])).rejects.toThrow(
      'At least one file must be provided for connection type csv.',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('adds staged uploads to an existing connection', async () => {
    await connectionApi.addFiles([], [{ upload_id: 'u2' }]);

    const { url, body } = lastRequest();
    expect(url).toContain('/add-files');
    expect(JSON.parse(body.get('staged_uploads_json') as string)).toEqual([{ upload_id: 'u2' }]);
  });

  it('omits the staged field when only files are added', async () => {
    await connectionApi.addFiles([new File(['id\n1\n'], 'a.csv')]);

    expect(lastRequest().body.get('staged_uploads_json')).toBeNull();
  });
});
