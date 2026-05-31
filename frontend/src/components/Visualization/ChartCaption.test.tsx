// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render } from '@testing-library/react';

jest.mock('marked', () => ({
  marked: {
    parse: (s: string) => s,
  },
}));

jest.mock('../../contexts/VisualizationContext', () => ({
  useVisualizationContext: jest.fn(),
}));

// eslint-disable-next-line import/first
import ChartCaption from './ChartCaption';
// eslint-disable-next-line import/first
import { useVisualizationContext } from '../../contexts/VisualizationContext';

const mockUse = useVisualizationContext as unknown as jest.Mock;

const setCaption = (caption: string) => {
  mockUse.mockReturnValue({
    state: { chartCaption: caption },
    dispatch: jest.fn(),
  });
};

describe('ChartCaption sanitization', () => {
  beforeEach(() => {
    mockUse.mockReset();
    delete (window as unknown as { __pwned?: boolean }).__pwned;
  });

  it('strips <script> tags from caption markdown', () => {
    setCaption('hello<script>window.__pwned=true</script>world');
    const { container } = render(<ChartCaption />);
    expect(container.innerHTML).not.toMatch(/<script/i);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('strips on* event handler attributes', () => {
    setCaption('<img src=x onerror="window.__pwned=true">');
    const { container } = render(<ChartCaption />);
    expect(container.innerHTML).not.toMatch(/onerror/i);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('strips javascript: URLs from anchors', () => {
    setCaption('<a href="javascript:alert(1)">click</a>');
    const { container } = render(<ChartCaption />);
    const anchor = container.querySelector('a');
    if (anchor) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });

  it('preserves safe HTML formatting', () => {
    setCaption('<strong>bold</strong> and <em>italic</em>');
    const { container } = render(<ChartCaption />);
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
  });
});
