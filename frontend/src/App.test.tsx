import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import { DataSourceProvider } from './contexts/DataSourceContext';
import { VisualizationProvider } from './contexts/VisualizationContext';
import { ConnectionProvider } from './contexts/ConnectionContext';

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
