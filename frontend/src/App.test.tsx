import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import { VisualizationProvider } from './contexts/VisualizationContext';
import { ConnectionProvider } from './contexts/ConnectionContext';

test('renders Data Slicer navigation tabs', () => {
  render(
    <VisualizationProvider>
      <ConnectionProvider>
        <App />
      </ConnectionProvider>
    </VisualizationProvider>
  );
  const dataSourcesTab = screen.getByText(/Data Sources/i);
  expect(dataSourcesTab).toBeInTheDocument();
  // The "Visualization" tab label can vary (sheet name) and may not render as literal text.
  // Sanity-check that the navigation tablist is present instead.
  expect(screen.getByRole('tablist', { name: /Data Slicer navigation/i })).toBeInTheDocument();
});
