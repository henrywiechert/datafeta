// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { useCurrentSnapshot } from './useCurrentSnapshot';
import { SavedConfiguration, SnapshotMetadata } from '../types';

const meta: SnapshotMetadata = {
  id: 'snap-1',
  name: 'Q3 Revenue',
  folder: 'Sales/Reports',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

function makeConfig(overrides: Partial<SavedConfiguration> = {}): SavedConfiguration {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    appName: 'DataSlicer',
    sheets: [],
    nextSheetNumber: 1,
    ...overrides,
  } as SavedConfiguration;
}

describe('useCurrentSnapshot', () => {
  it('starts untitled and not dirty', () => {
    const { result } = renderHook(() => useCurrentSnapshot());
    expect(result.current.current).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  it('adopts a snapshot identity', () => {
    const { result } = renderHook(() => useCurrentSnapshot());
    act(() => result.current.adopt(meta));
    expect(result.current.current).toEqual({
      id: 'snap-1',
      name: 'Q3 Revenue',
      folder: 'Sales/Reports',
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('reports dirty once the configuration diverges from the saved baseline', () => {
    const { result } = renderHook(() => useCurrentSnapshot());
    const config = makeConfig();

    act(() => {
      result.current.adopt(meta);
      result.current.markSaved(config);
    });
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.recomputeDirty(makeConfig({ nextSheetNumber: 2 })));
    expect(result.current.isDirty).toBe(true);
  });

  it('does not report dirty for a changed exportedAt alone', () => {
    // exportConfiguration() stamps a fresh exportedAt on every call, so an
    // otherwise-identical config must still compare as unmodified.
    const { result } = renderHook(() => useCurrentSnapshot());

    act(() => {
      result.current.adopt(meta);
      result.current.markSaved(makeConfig({ exportedAt: '2026-01-01T00:00:00.000Z' }));
    });

    act(() => result.current.recomputeDirty(makeConfig({ exportedAt: '2026-09-07T12:34:56.000Z' })));
    expect(result.current.isDirty).toBe(false);
  });

  it('markSaved clears a pending dirty flag', () => {
    const { result } = renderHook(() => useCurrentSnapshot());

    act(() => {
      result.current.adopt(meta);
      result.current.markSaved(makeConfig());
    });
    act(() => result.current.recomputeDirty(makeConfig({ nextSheetNumber: 5 })));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.markSaved(makeConfig({ nextSheetNumber: 5 })));
    expect(result.current.isDirty).toBe(false);
  });

  it('clear() drops the identity and stops tracking dirtiness', () => {
    const { result } = renderHook(() => useCurrentSnapshot());

    act(() => {
      result.current.adopt(meta);
      result.current.markSaved(makeConfig());
    });

    act(() => result.current.clear());
    expect(result.current.current).toBeNull();

    // No baseline means nothing to compare against — an untitled workspace is
    // never "dirty", it just has no saved home yet.
    act(() => result.current.recomputeDirty(makeConfig({ nextSheetNumber: 9 })));
    expect(result.current.isDirty).toBe(false);
  });

  it('adopting a new snapshot suspends dirtiness until a baseline is captured', () => {
    // After a load the restored state has not settled yet, so comparing would
    // produce a false "modified" reading.
    const { result } = renderHook(() => useCurrentSnapshot());

    act(() => {
      result.current.adopt(meta);
      result.current.markSaved(makeConfig());
    });
    act(() => result.current.recomputeDirty(makeConfig({ nextSheetNumber: 3 })));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.adopt({ ...meta, id: 'snap-2', name: 'Other' }));
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.recomputeDirty(makeConfig({ nextSheetNumber: 7 })));
    expect(result.current.isDirty).toBe(false);
  });
});
