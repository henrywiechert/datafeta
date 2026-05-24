// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeftFacetLabels, TopFacetLabels } from './FacetLabels';

const mockDispatch = jest.fn();
let mockGlobalChartType: any = 'bar';

const mockFacetLabelStyles = {
  topHeader: { fontSize: 12, fontSizeByDepth: [], orientation: 'horizontal', orientationByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] },
  topValues: { fontSize: 10, orientation: 'horizontal', orientationByDepth: [], heightPx: null, heightPxByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] },
  leftHeader: { fontSize: 12, fontSizeByDepth: [], orientation: 'vertical', orientationByDepth: [], widthPx: null, horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] },
  leftValues: { fontSize: 10, orientation: 'vertical', orientationByDepth: [], widthPx: null, widthPxByDepth: [], horizontalAlign: 'start', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] },
};

jest.mock('../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => ({
    state: {
      facetLabelStyles: mockFacetLabelStyles,
      globalChartType: mockGlobalChartType,
    },
    dispatch: mockDispatch,
  }),
}));

jest.mock('@mui/material', () => {
  const React = require('react');
  const ToggleGroupContext = React.createContext(null);
  const passthrough = ({ children, ...props }: any) => React.createElement('div', props, children);
  const omitProps = (props: Record<string, unknown>, keys: string[]) => Object.fromEntries(
    Object.entries(props).filter(([key]) => !keys.includes(key)),
  );

  return {
    Popover: ({ children, open, anchorEl, anchorOrigin, transformOrigin, PaperProps, ...props }: any) => open ? React.createElement('div', props, children) : null,
    Box: passthrough,
    Typography: passthrough,
    Slider: ({ value, onChange, ...props }: any) => React.createElement('input', {
      ...props,
      type: 'range',
      value,
      onChange: (event: any) => onChange?.(event, Number(event.target.value)),
    }),
    ToggleButtonGroup: ({ children, value, onChange, ...props }: any) => React.createElement(
      'div',
      omitProps(props, ['exclusive']),
      React.createElement(ToggleGroupContext.Provider, { value: { value, onChange } }, children),
    ),
    ToggleButton: ({ children, value, ...props }: any) => {
      const context = React.useContext(ToggleGroupContext);
      return React.createElement('button', {
        ...props,
        type: 'button',
        'aria-pressed': context?.value === value,
        onClick: () => context?.onChange?.({}, value),
      }, children);
    },
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
  beforeEach(() => {
    mockDispatch.mockClear();
    mockGlobalChartType = 'bar';
    mockFacetLabelStyles.topHeader = { fontSize: 12, fontSizeByDepth: [], orientation: 'horizontal', orientationByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] } as any;
    mockFacetLabelStyles.topValues = { fontSize: 10, orientation: 'horizontal', orientationByDepth: [], heightPx: null, heightPxByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] } as any;
    mockFacetLabelStyles.leftHeader = { fontSize: 12, fontSizeByDepth: [], orientation: 'vertical', orientationByDepth: [], widthPx: null, horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] } as any;
    mockFacetLabelStyles.leftValues = { fontSize: 10, orientation: 'vertical', orientationByDepth: [], widthPx: null, widthPxByDepth: [], horizontalAlign: 'start', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] } as any;
  });

  it('uses one top facet row height per depth', () => {
    const { container } = render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    const topGrid = container.querySelector('div[style*="grid-template-rows: 20px 24px 36px"]');
    expect(topGrid).toBeTruthy();
    expect(container.querySelector('div[style*="height: 24px"]')).toBeTruthy();
    expect(container.querySelector('div[style*="height: 36px"]')).toBeTruthy();
  });

  it('renders top hierarchical facet field names as one combined title', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    expect(screen.getByTitle('Click to edit style: Region | Category')).toHaveTextContent('Region | Category');
    expect(screen.queryByTitle('Click to edit style: Region')).toBeNull();
    expect(screen.queryByTitle('Click to edit style: Category')).toBeNull();
  });

  it('renders left hierarchical facet field names as one combined title', () => {
    render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    expect(screen.getByTitle('Click to edit style: Segment | State')).toHaveTextContent('Segment | State');
    expect(screen.queryByTitle('Click to edit style: Segment')).toBeNull();
    expect(screen.queryByTitle('Click to edit style: State')).toBeNull();
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

  it('applies shared alignment and orientation rules to the top facet title', () => {
    mockFacetLabelStyles.topHeader = {
      fontSize: 12,
      fontSizeByDepth: [11, 15],
      orientation: 'horizontal',
      orientationByDepth: ['horizontal', 'vertical'],
      horizontalAlign: 'start',
      verticalAlign: 'end',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['start', 'end'],
    } as any;

    const { container } = render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    const header = container.querySelector('div[title="Click to edit style: Region | Category"]');
    const headerText = header?.querySelector('div');

    expect(header).toHaveStyle({ justifyContent: 'flex-start', alignItems: 'flex-end', textAlign: 'left' });
    expect(headerText).toHaveStyle({ fontSize: '12px' });
    expect(headerText).not.toHaveStyle({ writingMode: 'vertical-rl' });
  });

  it('applies per-depth alignment, orientation, and wrap rules to top facet values', () => {
    mockFacetLabelStyles.topValues = {
      fontSize: 10,
      orientation: 'horizontal',
      orientationByDepth: ['horizontal', 'angled'],
      heightPx: null,
      heightPxByDepth: [],
      horizontalAlign: 'center',
      verticalAlign: 'center',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['start', 'end'],
      wrapMode: 'wrap',
      wrapModeByDepth: ['wrap', 'nowrap'],
    } as any;

    const { container } = render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    const firstDepthCell = container.querySelector('div[title="East"]');
    const secondDepthCell = container.querySelector('div[title="A"]');
    const firstDepthText = firstDepthCell?.querySelector('div');
    const secondDepthText = secondDepthCell?.querySelector('div');

    expect(firstDepthCell).toHaveStyle({ justifyContent: 'flex-start', alignItems: 'flex-start' });
    expect(firstDepthText).toHaveStyle({ whiteSpace: 'normal', textAlign: 'left', width: '100%' });
    expect(secondDepthCell).toHaveStyle({ justifyContent: 'flex-end', alignItems: 'flex-end' });
    expect(secondDepthText).toHaveStyle({ whiteSpace: 'nowrap', textAlign: 'right', transform: 'rotate(-45deg)' });
  });

  it('applies shared alignment rules to the left facet title', () => {
    mockFacetLabelStyles.leftHeader = {
      fontSize: 12,
      orientation: 'horizontal',
      orientationByDepth: [],
      widthPx: null,
      horizontalAlign: 'end',
      verticalAlign: 'center',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['center', 'center'],
    } as any;

    const { container } = render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    const header = container.querySelector('div[title="Click to edit style: Segment | State"]');
    expect(header).toHaveStyle({ justifyContent: 'flex-end', textAlign: 'right' });
  });

  it('applies per-depth alignment and wrapping rules to left facet values', () => {
    mockFacetLabelStyles.leftValues = {
      fontSize: 10,
      orientation: 'horizontal',
      orientationByDepth: [],
      widthPx: null,
      widthPxByDepth: [],
      horizontalAlign: 'start',
      verticalAlign: 'center',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['start', 'end'],
      wrapMode: 'wrap',
      wrapModeByDepth: ['wrap', 'nowrap'],
    } as any;

    const { container } = render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    const firstDepthCell = container.querySelector('div[title="Consumer"]');
    const secondDepthCell = container.querySelector('div[title="CA"]');
    const firstDepthText = firstDepthCell?.querySelector('div');
    const secondDepthText = secondDepthCell?.querySelector('div');

    expect(firstDepthCell).toHaveStyle({ justifyContent: 'flex-start', alignItems: 'flex-start' });
    expect(firstDepthText).toHaveStyle({ whiteSpace: 'normal', textAlign: 'left', width: '100%' });
    expect(secondDepthCell).toHaveStyle({ justifyContent: 'flex-end', alignItems: 'flex-end' });
    expect(secondDepthText).toHaveStyle({ whiteSpace: 'nowrap', textAlign: 'right' });
  });

  it('applies wrap mode to vertical left facet values', () => {
    mockFacetLabelStyles.leftValues = {
      fontSize: 10,
      orientation: 'vertical',
      orientationByDepth: [],
      widthPx: null,
      widthPxByDepth: [],
      horizontalAlign: 'start',
      verticalAlign: 'center',
      horizontalAlignByDepth: [],
      verticalAlignByDepth: [],
      wrapMode: 'wrap',
      wrapModeByDepth: ['wrap', 'nowrap'],
    } as any;

    const { container } = render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    const firstDepthCell = container.querySelector('div[title="Consumer"]');
    const secondDepthCell = container.querySelector('div[title="CA"]');
    const firstDepthText = firstDepthCell?.querySelector('div');
    const secondDepthText = secondDepthCell?.querySelector('div');

    expect(firstDepthText).toHaveStyle({
      whiteSpace: 'normal',
      height: '100%',
      maxHeight: '100%',
      writingMode: 'vertical-rl',
    });
    expect(secondDepthText).toHaveStyle({
      whiteSpace: 'nowrap',
      writingMode: 'vertical-rl',
    });
  });

  it('renders left facet values horizontally by default in table mode', () => {
    mockGlobalChartType = 'table-refactor';
    mockFacetLabelStyles.leftValues = {
      fontSize: 10,
      orientation: 'vertical',
      orientationByDepth: [],
      widthPx: null,
      widthPxByDepth: [],
      horizontalAlign: 'start',
      verticalAlign: 'center',
      horizontalAlignByDepth: [],
      verticalAlignByDepth: [],
      wrapMode: 'wrap',
      wrapModeByDepth: [],
    } as any;

    const { container } = render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[80, 80]}
      />,
    );

    const firstDepthText = container.querySelector('div[title="Consumer"] > div');
    expect(firstDepthText).not.toHaveStyle({ writingMode: 'vertical-rl' });
  });

  it('opens a combined left header popover and dispatches shared alignment updates', () => {
    render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit style: Segment | State'));

    expect(screen.getByText('Facet names: Segment | State')).toBeTruthy();

    expect(screen.getByText('Horizontal Align')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'End' })[0]);

    const headerAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_LEFT_HEADER_STYLE')?.[0];
    expect(headerAction.payload.horizontalAlign).toBe('end');
  });

  it('opens a combined top header popover and dispatches shared orientation updates', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit style: Region | Category'));

    expect(screen.getByText('Facet names: Region | Category')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'vertical' }));

    const headerAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_TOP_HEADER_STYLE')?.[0];
    expect(headerAction.payload.orientation).toBe('vertical');
  });

  it('dispatches shared top header font size updates', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit style: Region | Category'));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '18' } });

    const headerAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_TOP_HEADER_STYLE' && action.payload.fontSize)?.[0];
    expect(headerAction.payload.fontSize).toBe(18);
  });

  it('opens a depth-aware top values popover and dispatches wrap updates for that depth', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    fireEvent.click(screen.getByTitle('East'));

    expect(screen.getByText('Hierarchy 1: East')).toBeTruthy();
    expect(screen.getByText('Wrap Mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'No Wrap' }));

    const valuesAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_TOP_VALUES_STYLE')?.[0];
    expect(valuesAction.payload.wrapModeByDepth[0]).toBe('nowrap');
  });

  it('does not render width controls in facet style popovers', () => {
    render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit style: Segment | State'));

    expect(screen.queryByText('Auto Width')).toBeNull();
    expect(screen.queryByText('Width (px)')).toBeNull();
  });

  it('does not render height controls in top facet values popovers', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopHeaderPx={20}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    fireEvent.click(screen.getByTitle('East'));

    expect(screen.queryByText('Auto Height')).toBeNull();
    expect(screen.queryByText('Height (px)')).toBeNull();
  });

  it('opens a depth-aware left values popover and dispatches wrap updates for that depth', () => {
    mockFacetLabelStyles.leftValues = {
      fontSize: 10,
      orientation: 'horizontal',
      orientationByDepth: [],
      widthPx: null,
      widthPxByDepth: [],
      horizontalAlign: 'start',
      verticalAlign: 'center',
      horizontalAlignByDepth: [],
      verticalAlignByDepth: [],
      wrapMode: 'wrap',
      wrapModeByDepth: [],
    } as any;

    render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    fireEvent.click(screen.getByTitle('Consumer'));

    expect(screen.getByText('Hierarchy 1: Consumer')).toBeTruthy();

    expect(screen.getByText('Wrap Mode')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'No Wrap' }));

    const valuesAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_LEFT_VALUES_STYLE')?.[0];
    expect(valuesAction.payload.wrapModeByDepth[0]).toBe('nowrap');
  });
});