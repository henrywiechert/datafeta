import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Data Slicer navigation tabs', () => {
  render(<App />);
  const dataSourcesTab = screen.getByText(/Data Sources/i);
  expect(dataSourcesTab).toBeInTheDocument();
  const visualizationTab = screen.getByText(/Visualization/i);
  expect(visualizationTab).toBeInTheDocument();
});
