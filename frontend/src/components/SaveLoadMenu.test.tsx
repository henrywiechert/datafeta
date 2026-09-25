// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SaveLoadMenu from './SaveLoadMenu';

function setup(overrides: Partial<React.ComponentProps<typeof SaveLoadMenu>> = {}) {
  const props = {
    onExportFile: jest.fn(),
    onLoad: jest.fn(),
    onOpenGallery: jest.fn(),
    onSave: jest.fn().mockResolvedValue(undefined),
    onSaveAs: jest.fn(),
    onNew: jest.fn(),
    ...overrides,
  };
  render(<SaveLoadMenu {...props} />);
  return props;
}

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'File' }));
};

describe('SaveLoadMenu', () => {
  it('offers New as the first item and invokes onNew', async () => {
    const props = setup();
    await openMenu();
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('New');
    await userEvent.click(screen.getByText('New'));
    expect(props.onNew).toHaveBeenCalledTimes(1);
  });

  it('offers Save and Save As when server storage is writable', async () => {
    setup();
    await openMenu();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Save As...')).toBeInTheDocument();
  });

  it('hides Save and Save As when server storage is read-only', async () => {
    setup({ serverStorageWritable: false });
    await openMenu();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Save As...')).not.toBeInTheDocument();
    // The file escape hatch and the read-only gallery stay available.
    expect(screen.getByText('Export to File...')).toBeInTheDocument();
    expect(screen.getByText('Saved Configurations...')).toBeInTheDocument();
  });

  it('hides Save and Save As when there is no server storage at all', async () => {
    setup({ onOpenGallery: undefined });
    await openMenu();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Save As...')).not.toBeInTheDocument();
    expect(screen.getByText('Save Configuration')).toBeInTheDocument();
  });

  it('invokes onSave for Save, not the file export', async () => {
    const props = setup();
    await openMenu();
    await userEvent.click(screen.getByText('Save'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onExportFile).not.toHaveBeenCalled();
  });

  it('invokes onSaveAs for Save As', async () => {
    const props = setup();
    await openMenu();
    await userEvent.click(screen.getByText('Save As...'));
    expect(props.onSaveAs).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('invokes onExportFile for Export to File', async () => {
    const props = setup();
    await openMenu();
    await userEvent.click(screen.getByText('Export to File...'));
    expect(props.onExportFile).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('invokes onShare for Share', async () => {
    const props = setup({ onShare: jest.fn() });
    await openMenu();
    await userEvent.click(screen.getByText('Share...'));
    expect(props.onShare).toHaveBeenCalledTimes(1);
  });

  it('hides Share when no onShare handler is given', async () => {
    setup();
    await openMenu();
    expect(screen.queryByText('Share...')).not.toBeInTheDocument();
  });
});
