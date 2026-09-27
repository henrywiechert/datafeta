// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDoubleTap } from './useDoubleTap';

const Target: React.FC<{ onDoubleTap: () => void }> = ({ onDoubleTap }) => {
  const handlers = useDoubleTap(onDoubleTap);
  return <div data-testid="target" {...handlers} />;
};

const touch = { pointerType: 'touch', isPrimary: true, clientX: 40, clientY: 60 };

function tap(target: HTMLElement, init: Record<string, unknown> = touch) {
  fireEvent.pointerDown(target, init);
  fireEvent.pointerUp(target, init);
}

describe('useDoubleTap', () => {
  let now = 1_000;
  beforeEach(() => {
    now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('fires on two quick taps', () => {
    const onDoubleTap = jest.fn();
    render(<Target onDoubleTap={onDoubleTap} />);
    const target = screen.getByTestId('target');
    tap(target);
    now += 200;
    tap(target);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a single tap or slow taps', () => {
    const onDoubleTap = jest.fn();
    render(<Target onDoubleTap={onDoubleTap} />);
    const target = screen.getByTestId('target');
    tap(target);
    now += 500;
    tap(target);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('does not count a drag as a tap', () => {
    const onDoubleTap = jest.fn();
    render(<Target onDoubleTap={onDoubleTap} />);
    const target = screen.getByTestId('target');
    tap(target);
    now += 100;
    fireEvent.pointerDown(target, touch);
    fireEvent.pointerUp(target, { ...touch, clientY: 120 });
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('ignores mouse pointers', () => {
    const onDoubleTap = jest.fn();
    render(<Target onDoubleTap={onDoubleTap} />);
    const target = screen.getByTestId('target');
    const mouse = { pointerType: 'mouse', isPrimary: true, clientX: 40, clientY: 60 };
    tap(target, mouse);
    now += 100;
    tap(target, mouse);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });
});
