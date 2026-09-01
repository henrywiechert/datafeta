// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CustomTooltip } from './CustomTooltip';
import { Field, TooltipField } from '../../../types';

const linkField: Field = {
  id: 'f1',
  columnName: 'cell_link',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
  is_virtual: true,
};

const makeField = (overrides: Partial<TooltipField> = {}): TooltipField => ({
  label: 'Cell link',
  value: 'https://ncm.corp/cell/4711',
  rawValue: 'https://ncm.corp/cell/4711',
  sourceField: linkField,
  ...overrides,
});

const renderTooltip = (props: Partial<React.ComponentProps<typeof CustomTooltip>> = {}) =>
  render(
    <CustomTooltip
      x={10}
      y={20}
      visible
      fields={[makeField()]}
      linkColumns={['cell_link']}
      {...props}
    />
  );

describe('CustomTooltip link columns', () => {
  test('renders an anchor when pinned and the column is a link column', () => {
    renderTooltip({ pinned: true });

    const anchor = screen.getByRole('link');
    expect(anchor).toHaveAttribute('href', 'https://ncm.corp/cell/4711');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('does not render an anchor while unpinned, since the tooltip has no pointer events', () => {
    const { container } = renderTooltip({ pinned: false });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // The link affordance is still shown so the user knows to pin.
    expect(container.querySelector('.custom-tooltip__link-hint')).toBeInTheDocument();
    expect(screen.getByText('https://ncm.corp/cell/4711')).toBeInTheDocument();
  });

  test('renders plain text for columns not marked as links', () => {
    const { container } = renderTooltip({ pinned: true, linkColumns: [] });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('.custom-tooltip__link-hint')).not.toBeInTheDocument();
    expect(screen.getByText('https://ncm.corp/cell/4711')).toBeInTheDocument();
  });

  test('renders plain text when the value is not a safe http(s) URL', () => {
    const { container } = renderTooltip({
      pinned: true,
      // eslint-disable-next-line no-script-url
      fields: [makeField({ value: 'javascript:alert(1)', rawValue: 'javascript:alert(1)' })],
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('.custom-tooltip__link-hint')).not.toBeInTheDocument();
  });

  test('suppresses the link when the cell aggregates several distinct values', () => {
    renderTooltip({ pinned: true, fields: [makeField({ extraCount: 3 })] });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/\(\+3 more\)/)).toBeInTheDocument();
  });

  test('shows the formatted value as link text but links to the raw URL', () => {
    renderTooltip({
      pinned: true,
      fields: [makeField({ formattedValue: 'Cell 4711' })],
    });

    const anchor = screen.getByRole('link');
    expect(anchor).toHaveAttribute('href', 'https://ncm.corp/cell/4711');
    expect(anchor).toHaveTextContent('Cell 4711');
  });
});
