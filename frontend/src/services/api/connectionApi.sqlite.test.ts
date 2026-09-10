// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { connectionApi } from './connectionApi';

describe('connectionApi.connect for SQLite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'connected', file_paths: ['/tmp/shop.db'] }),
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uploads the database file as multipart form data', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shop.db');

    await connectionApi.connect({ type: 'sqlite' }, [file]);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/connect');
    expect(url).not.toContain('/connect/json');

    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(body.get('connection_details_json') as string)).toEqual({ type: 'sqlite' });
    expect(body.getAll('uploaded_files')).toHaveLength(1);
  });

  it('rejects a SQLite connection without a file instead of posting JSON', async () => {
    await expect(connectionApi.connect({ type: 'sqlite' })).rejects.toThrow(
      'At least one file must be provided for connection type sqlite.',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
