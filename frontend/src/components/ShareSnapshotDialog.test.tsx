// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShareSnapshotDialog from './ShareSnapshotDialog';

const snapshot = { id: 'abc123', name: 'Q3 Revenue', folder: 'Sales' };

function setup(overrides: Partial<React.ComponentProps<typeof ShareSnapshotDialog>> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    snapshot,
    isDirty: false,
    canSave: true,
    onSave: jest.fn().mockResolvedValue(undefined),
    onSaveAs: jest.fn(),
    ...overrides,
  };
  const utils = render(<ShareSnapshotDialog {...props} />);
  return { props, ...utils };
}

const linkField = () => screen.getByLabelText('Link') as HTMLInputElement;

describe('ShareSnapshotDialog', () => {
  it('shows the link for a saved snapshot', () => {
    setup();
    expect(linkField().value).toBe(`${window.location.origin}/?snapshot=abc123`);
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('carries a database override into the link', () => {
    setup({ databaseOverride: 'analytics_prod' });
    expect(linkField().value).toBe(`${window.location.origin}/?snapshot=abc123&database=analytics_prod`);
  });

  it('copies the link to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    setup();
    await userEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?snapshot=abc123`);
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  it('falls back to manual copy when no clipboard is available', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    document.execCommand = jest.fn().mockReturnValue(false);
    setup();
    await userEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(await screen.findByText(/to copy$/)).toBeInTheDocument();
  });

  it('asks to save a touched snapshot before sharing, then shows the link', async () => {
    const { props, rerender } = setup({ isDirty: true });
    expect(screen.queryByLabelText('Link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save & share/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);

    // The parent clears the dirty flag once the save lands.
    rerender(<ShareSnapshotDialog {...props} isDirty={false} />);
    expect(linkField().value).toContain('snapshot=abc123');
  });

  it('shows the save error and no link when saving fails', async () => {
    setup({ isDirty: true, onSave: jest.fn().mockRejectedValue(new Error('Server down')) });
    await userEvent.click(screen.getByRole('button', { name: /save & share/i }));
    expect(await screen.findByText('Server down')).toBeInTheDocument();
    expect(screen.queryByLabelText('Link')).not.toBeInTheDocument();
  });

  it('offers Save as snapshot for an untitled workspace', async () => {
    const { props } = setup({ snapshot: null });
    expect(screen.queryByLabelText('Link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /save as snapshot/i }));
    expect(props.onSaveAs).toHaveBeenCalledTimes(1);
  });

  it('shares the saved version of a touched snapshot on a read-only server', () => {
    setup({ isDirty: true, canSave: false });
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
    expect(linkField().value).toContain('snapshot=abc123');
    expect(screen.queryByRole('button', { name: /save & share/i })).not.toBeInTheDocument();
  });

  it('points to file export for an untitled workspace on a read-only server', () => {
    setup({ snapshot: null, canSave: false });
    expect(screen.getByText(/Export to File/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as snapshot/i })).not.toBeInTheDocument();
  });
});
