// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import QueryStatusIndicator from './QueryStatusIndicator';
import { VisualizationProvider } from '../../../../contexts/VisualizationContext';

describe('QueryStatusIndicator', () => {
  test('shows unknown when no query has run', () => {
    render(
      <VisualizationProvider initialState={{ queryResult: null, queryError: null }}>
        <QueryStatusIndicator />
      </VisualizationProvider>
    );
  const el = screen.getByTestId('query-status-indicator');
  expect(el).toHaveAttribute('aria-label', 'Query status: unknown');
  expect(el.textContent).toBe('Query');
  });

  test('shows ok when query result exists', () => {
    render(
      <VisualizationProvider initialState={{ queryResult: { row_count: 5 } as any, queryError: null }}>
        <QueryStatusIndicator />
      </VisualizationProvider>
    );
  const el = screen.getByTestId('query-status-indicator');
  expect(el).toHaveAttribute('aria-label', 'Query status: ok');
  expect(el.textContent).toBe('Query');
  });

  test('shows error when query error exists', () => {
    render(
      <VisualizationProvider initialState={{ queryResult: null, queryError: 'Failed' }}>
        <QueryStatusIndicator />
      </VisualizationProvider>
    );
  const el = screen.getByTestId('query-status-indicator');
  expect(el).toHaveAttribute('aria-label', 'Query status: error');
  expect(el.textContent).toBe('Query');
  });
});
