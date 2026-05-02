import React from 'react';
import { render } from '@testing-library/react';
import { LeftFacetLabels, TopFacetLabels } from './FacetLabels';

jest.mock('../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => ({
    state: {
      facetLabelStyles: {
        topHeader: { fontSize: 12, orientation: 'horizontal' },
        topValues: { fontSize: 10, orientation: 'horizontal', heightPx: null, heightPxByDepth: [] },
        leftHeader: { fontSize: 12, orientation: 'vertical', widthPx: null },
        leftValues: { fontSize: 10, orientation: 'vertical', widthPx: null, widthPxByDepth: [] },
      },
    },
    dispatch: jest.fn(),
  }),
}));

jest.mock('@mui/material', () => {
  const React = require('react');
  const passthrough = ({ children, ...props }: any) => React.createElement('div', props, children);
  return {
    Popover: passthrough,
    Box: passthrough,
    Typography: passthrough,
    Slider: passthrough,
    ToggleButton: passthrough,
    ToggleButtonGroup: passthrough,
    TextField: passthrough,
    FormControlLabel: passthrough,
    Switch: passthrough,
  };
});

function buildGrid() {
  return {
    cells: [],
    layout: {
      type: 'grid',
      columns: 4,
      rows: 3,
      columnSizes: [100, 100, 100, 100],
      rowSizes: [80, 80, 80],
    },
    headers: {
      cols: {
        baseSpan: 1,
        levels: [
          { fieldLabel: 'Region', values: ['East', 'West'] },
          { fieldLabel: 'Category', values: ['A', 'B'] },
        ],
        orderedValueTuples: [['East', 'A'], ['East', 'B'], ['West', 'A'], ['West', 'B']],
      },
      rows: {
        baseSpan: 1,
        levels: [
          { fieldLabel: 'Segment', values: ['Consumer', 'Corporate'] },
          { fieldLabel: 'State', values: ['CA', 'NY'] },
        ],
        orderedValueTuples: [['Consumer', 'CA'], ['Consumer', 'NY'], ['Corporate', 'CA']],
      },
    },
  } as any;
}

describe('FacetLabels', () => {
  it('uses one top facet row height per depth', () => {
    const { container } = render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    const topGrid = container.querySelector('div[style*="grid-template-rows: 20px 24px 36px"]');
    expect(topGrid).toBeTruthy();
    expect(container.querySelector('div[style*="height: 24px"]')).toBeTruthy();
    expect(container.querySelector('div[style*="height: 36px"]')).toBeTruthy();
  });

  it('uses one left facet column width per depth', () => {
    const { container } = render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    const leftGrid = container.querySelector('div[style*="grid-template-columns: 28px 44px 72px"]');
    expect(leftGrid).toBeTruthy();
  });
});