// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { createViewportController } from './viewportController';

describe('createViewportController', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('updates the live value immediately and commits once after idle', () => {
    const c = createViewportController(100);
    const onCommit = jest.fn();
    c.subscribeCommitted(onCommit);
    c.set({ t: { min: 1, max: 2 } });
    c.set({ t: { min: 2, max: 3 } });
    expect(c.get('t')).toEqual({ min: 2, max: 3 });
    expect(c.getCommitted()).toEqual({});
    jest.advanceTimersByTime(100);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(c.getCommitted()).toEqual({ t: { min: 2, max: 3 } });
  });

  test('null removes a column; flush commits immediately', () => {
    const c = createViewportController(100);
    c.set({ t: { min: 1, max: 2 } });
    c.flush();
    c.set({ t: null });
    expect(c.get('t')).toBeUndefined();
    c.flush();
    expect(c.getCommitted()).toEqual({});
  });

  test('the committed object is stable between commits', () => {
    const c = createViewportController(100);
    c.set({ t: { min: 1, max: 2 } });
    c.flush();
    const first = c.getCommitted();
    c.flush();
    expect(c.getCommitted()).toBe(first);
  });

  test('clear commits immediately, and is a no-op when nothing is set', () => {
    const c = createViewportController(100);
    const onCommit = jest.fn();
    c.subscribeCommitted(onCommit);
    c.clear();
    expect(onCommit).not.toHaveBeenCalled();

    c.set({ a: { min: 1, max: 2 }, b: { min: 3, max: 4 } });
    c.clear(['a']);
    expect(c.get('a')).toBeUndefined();
    expect(c.getCommitted()).toEqual({ b: { min: 3, max: 4 } });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test('notifies live subscribers on every change', () => {
    const c = createViewportController(100);
    const listener = jest.fn();
    const unsubscribe = c.subscribe(listener);
    c.set({ t: { min: 1, max: 2 } });
    c.clear();
    unsubscribe();
    c.set({ t: { min: 1, max: 2 } });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
