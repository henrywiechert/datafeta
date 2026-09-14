// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * The footer row is load-bearing for hover behaviour: if it vanished once the exact
 * count arrived, the panel would shrink, slide out from under the pointer, and close
 * itself on the resulting mouseleave. These tests pin that it survives every state.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import QuickViewPanel from './QuickViewPanel';
import { useFieldProfile } from '../../../hooks/useFieldProfile';
import { Field, FieldProfile } from '../../../types';

jest.mock('../../../hooks/useFieldProfile', () => ({
  ...jest.requireActual('../../../hooks/useFieldProfile'),
  useFieldProfile: jest.fn(),
}));

const mockUseFieldProfile = useFieldProfile as jest.Mock;

const field: Field = {
  id: 'category',
  columnName: 'category',
  type: 'dimension',
  flavour: 'discrete',
  dataType: 'string',
};

const profile = (approximate: boolean): FieldProfile => ({
  field: 'category',
  profile_kind: 'string',
  approximate,
  row_count: 1000,
  null_count: 0,
  distinct_count: 42,
  duration_ms: 1,
});

const loadExact = jest.fn();

const openPanel = (approximate: boolean, loading = false) => {
  mockUseFieldProfile.mockReturnValue({
    profile: profile(approximate),
    loading,
    error: null,
    start: jest.fn(),
    cancel: jest.fn(),
    loadExact,
  });
  const { container } = render(<QuickViewPanel field={field} />);
  fireEvent.mouseOver(screen.getByText('Quick View →'));
  return container;
};

beforeEach(() => {
  loadExact.mockClear();
});

it('offers the exact count while the distinct value is an estimate', () => {
  openPanel(true);

  expect(screen.getByText('~42')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Count distinct exactly'));
  expect(loadExact).toHaveBeenCalledTimes(1);
});

it('keeps a blank footer row after the exact count replaces the estimate', () => {
  const container = openPanel(false);

  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.queryByText('Count distinct exactly')).not.toBeInTheDocument();
  // Same one-line box as the link it replaces, so the panel does not shrink.
  expect(container.querySelector('.exactSpacer')).not.toBeNull();
});

it('ignores a second click while the exact count is in flight', () => {
  openPanel(true, true);

  fireEvent.click(screen.getByText('Counting…'));
  expect(loadExact).not.toHaveBeenCalled();
});
