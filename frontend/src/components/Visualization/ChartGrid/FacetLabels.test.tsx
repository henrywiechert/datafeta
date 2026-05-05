import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeftFacetLabels, TopFacetLabels } from './FacetLabels';

const mockDispatch = jest.fn();

const mockFacetLabelStyles = {
  topHeader: { fontSize: 12, orientation: 'horizontal', orientationByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] },
  topValues: { fontSize: 10, orientation: 'horizontal', orientationByDepth: [], heightPx: null, heightPxByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] },
  leftHeader: { fontSize: 12, orientation: 'vertical', orientationByDepth: [], widthPx: null, horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] },
  leftValues: { fontSize: 10, orientation: 'vertical', orientationByDepth: [], widthPx: null, widthPxByDepth: [], horizontalAlign: 'start', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] },
};

jest.mock('../../../contexts/VisualizationContext', () => ({
  useVisualizationContext: () => ({
    state: {
      facetLabelStyles: mockFacetLabelStyles,
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
    TextField: ({ label, value, onChange, type, ...props }: any) => React.createElement(
      'label',
      null,
      label,
      React.createElement('input', { ...props, type: type ?? 'text', value, onChange }),
    ),
    FormControlLabel: ({ control, label, ...props }: any) => React.createElement('label', props, control, label),
    Switch: ({ checked, onChange, ...props }: any) => React.createElement('input', {
      ...props,
      type: 'checkbox',
      checked,
      onChange,
    }),
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
    mockFacetLabelStyles.topHeader = { fontSize: 12, orientation: 'horizontal', orientationByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] } as any;
    mockFacetLabelStyles.topValues = { fontSize: 10, orientation: 'horizontal', orientationByDepth: [], heightPx: null, heightPxByDepth: [], horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] } as any;
    mockFacetLabelStyles.leftHeader = { fontSize: 12, orientation: 'vertical', orientationByDepth: [], widthPx: null, horizontalAlign: 'center', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [] } as any;
    mockFacetLabelStyles.leftValues = { fontSize: 10, orientation: 'vertical', orientationByDepth: [], widthPx: null, widthPxByDepth: [], horizontalAlign: 'start', verticalAlign: 'center', horizontalAlignByDepth: [], verticalAlignByDepth: [], wrapMode: 'wrap', wrapModeByDepth: [] } as any;
  });

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

  it('applies per-depth alignment rules to top facet headers', () => {
    mockFacetLabelStyles.topHeader = {
      fontSize: 12,
      orientation: 'horizontal',
      orientationByDepth: ['horizontal', 'vertical'],
      horizontalAlign: 'center',
      verticalAlign: 'center',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['start', 'end'],
    } as any;

    const { container } = render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    const firstHeader = container.querySelector('div[title="Click to edit style: Region"]');
    const secondHeader = container.querySelector('div[title="Click to edit style: Category"]');
    const secondHeaderText = secondHeader?.querySelector('div');

    expect(firstHeader).toHaveStyle({ justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left' });
    expect(secondHeader).toHaveStyle({ justifyContent: 'flex-end', alignItems: 'flex-end', textAlign: 'right' });
    expect(secondHeaderText).toHaveStyle({ writingMode: 'vertical-rl' });
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

  it('applies per-depth alignment rules to left facet headers', () => {
    mockFacetLabelStyles.leftHeader = {
      fontSize: 12,
      orientation: 'horizontal',
      orientationByDepth: [],
      widthPx: null,
      horizontalAlign: 'center',
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

    const firstHeader = container.querySelector('div[title="Click to edit style: Segment"]');
    const secondHeader = container.querySelector('div[title="Click to edit style: State"]');
    expect(firstHeader).toHaveStyle({ justifyContent: 'flex-start', textAlign: 'left' });
    expect(secondHeader).toHaveStyle({ justifyContent: 'flex-end', textAlign: 'right' });
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

  it('opens a depth-aware left header popover and dispatches per-depth alignment updates', () => {
    render(
      <LeftFacetLabels
        grid={buildGrid()}
        plotRowsSpec="80px 80px 80px"
        baseRows={1}
        facetLeftHeaderPx={28}
        facetLeftValueWidthsPx={[44, 72]}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit style: State'));

    expect(screen.getByText('Hierarchy 2: State')).toBeTruthy();

    expect(screen.getByText('Horizontal Align')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'End' })[0]);

    const headerAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_LEFT_HEADER_STYLE')?.[0];
    expect(headerAction.payload.horizontalAlignByDepth[1]).toBe('end');
  });

  it('opens a depth-aware top header popover and dispatches per-depth orientation updates', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
        facetTopValueHeightsPx={[24, 36]}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit style: Category'));

    expect(screen.getByText('Hierarchy 2: Category')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'vertical' }));

    const headerAction = mockDispatch.mock.calls.find(([action]) => action.type === 'SET_FACET_TOP_HEADER_STYLE')?.[0];
    expect(headerAction.payload.orientationByDepth[1]).toBe('vertical');
  });

  it('opens a depth-aware top values popover and dispatches wrap updates for that depth', () => {
    render(
      <TopFacetLabels
        grid={buildGrid()}
        plotTemplateColumns="repeat(4, 100px)"
        baseCols={1}
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

    fireEvent.click(screen.getByTitle('Click to edit style: Segment'));

    expect(screen.queryByText('Auto Width')).toBeNull();
    expect(screen.queryByText('Width (px)')).toBeNull();
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