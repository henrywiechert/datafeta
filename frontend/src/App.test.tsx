// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import { DataSourceProvider } from './contexts/DataSourceContext';
import { VisualizationProvider } from './contexts/VisualizationContext';
import { ConnectionProvider } from './contexts/ConnectionContext';

jest.mock('./contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    appConfig: {
      appMode: 'standard',
      isDemoMode: false,
      snapshots: { enabled: true, writable: true, mode: 'writable' },
      debugUiEnabled: true,
      connectors: { restricted: false, allowed: [] },
      demoDatasets: { enabled: false, available: false },
    },
    isLoading: false,
    error: null,
    isConnectorAllowed: () => true,
  }),
}));

test('renders Data Slicer navigation tabs', async () => {
  render(
    <DataSourceProvider>
      <VisualizationProvider>
        <ConnectionProvider>
          <App />
        </ConnectionProvider>
      </VisualizationProvider>
    </DataSourceProvider>
  );

  await act(async () => {
    await Promise.resolve();
  });

  const dataSourcesTab = await screen.findByText(/Data Sources/i);
  expect(dataSourcesTab).toBeInTheDocument();
  // The "Visualization" tab label can vary (sheet name) and may not render as literal text.
  // Sanity-check that the navigation tablist is present instead.
  expect(await screen.findByRole('tablist', { name: /Data Slicer navigation/i })).toBeInTheDocument();
});
